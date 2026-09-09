import path from "node:path";
import { realpath } from "node:fs/promises";
import {
  createAgentSession,
  createBashToolDefinition,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { fallbackCapsuleInput } from "../core/capsule.js";
import type { ChildExecutionResult, ChildUsage, ResultCapsuleInput, ScopeRecord } from "../core/types.js";
import type { ScopeStore } from "../storage/scope-store.js";
import { ChildTraceRecorder } from "../trace/child-trace-recorder.js";
import { createScopeReturnTool } from "./return-tool.js";
import type { ParentSnapshot } from "./context.js";
import { projectGuidance } from "./project-guidance.js";
import { DockerRuntime } from "../runtime/docker.js";
import { snapshotProject } from "../runtime/project-snapshot.js";
import { captureWorkspacePatch } from "../runtime/workspace-patch.js";
import { dockerBash } from "./docker-bash.js";
import { dockerPolicy } from "../runtime/docker-policy.js";

export interface ChildRunRequest {
  scope: ScopeRecord;
  snapshot?: ParentSnapshot;
  repoInstructions?: boolean;
  parent: Pick<ExtensionContext, "model" | "thinkingLevel">;
  signal: AbortSignal;
  onActivity?: (label: string) => void;
}

export interface ChildExecutor {
  run(request: ChildRunRequest): Promise<ChildExecutionResult>;
}

function emptyUsage(): ChildUsage {
  return {
    turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function collectUsage(session: AgentSession, inherited: ReadonlySet<string>): ChildUsage {
  const total = emptyUsage();
  // Count persisted entries, including history and summary calls removed by compaction.
  for (const entry of session.sessionManager.getEntries()) {
    if (inherited.has(entry.id)) continue;
    const message = entry.type === "message" ? entry.message : undefined;
    if (message?.role === "assistant") total.turns += 1;
    const usage = message?.role === "assistant" || message?.role === "toolResult" ? message.usage
      : entry.type === "compaction" || entry.type === "branch_summary" ? entry.usage : undefined;
    if (!usage) continue;
    for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) total[key] += usage[key];
    for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) total.cost[key] += usage.cost[key];
    for (const key of ["reasoning", "cacheWrite1h"] as const) {
      if (usage[key] !== undefined) total[key] = (total[key] ?? 0) + usage[key];
    }
  }
  return total;
}

function childInstructions(scope: ScopeRecord, mapping?: { cwd: string; sourceRoot: string }): string {
  return [
    "You are a focused child session working for a parent Pi agent.",
    `Goal: ${scope.goal}`,
    `Scope ID: ${scope.id}`,
    ...(mapping ? [`Path mapping: source project ${mapping.sourceRoot} is copied to /workspace. Parent cwd ${scope.cwd} corresponds to guest cwd ${mapping.cwd}. Translate source paths accordingly.`] : []),
    scope.workspaceMode === "docker-copy"
      ? "Workspace mode: docker-copy. All work runs in a disposable committed project copy under /workspace; no host mounts or automatic promotion. Network follows the owner policy described below. Only Bash and scope_return exist. Host paths in inherited text are not accessible: use the guest cwd. Read/search/edit using shell commands, not unavailable host tools."
      : `Workspace mode: ${scope.workspaceMode}. The workspace is shared with the parent and is not a security boundary.`,
    scope.workspaceMode === "docker-copy"
      ? "Use /tmp for temporary files. Guest files disappear at scope end. The harness automatically captures a bounded text patch before cleanup; no backups or manual diff printing are needed. Capture may fail for unsupported files/paths or size limits, reported explicitly to the parent. Preserve other findings as command output; do not promise durable guest artifact paths. Use available package managers with project-local or /tmp installs when the owner's network policy permits. Do not use host fallback or assume parent-only tools/credentials exist; report missing access as a specific blocker."
      : `Use ${scope.runtime.scratchPath ?? "the assigned scratch directory"} for temporary scripts, downloads, and logs.`,
    ...(scope.runtime.capabilities ? [scope.runtime.capabilities.summary] : []),
    "Investigate only the assigned goal. Preserve concrete evidence such as paths, symbols, commands, and test results.",
    scope.context === "fork"
      ? "You inherit a snapshot of the parent conversation and instructions, not live updates. Focus on the assigned goal. Parent tools/permissions are not inherited; only the currently supplied child tools are available."
      : "You do not see the parent conversation. If the goal omits essential context, return partial with the missing information; do not guess the reported problem.",
    `You have at most ${scope.budget.maxTurns ?? 8} investigation turns. Stop once you have enough evidence; this is an allowance, not a target.`,
    "Project guidance is instruction, not a permission grant. Check for more-specific guidance if you explore nested directories; only starting-directory guidance is preloaded.",
    "Do not assume your transcript will enter the parent context.",
    "When done, call scope_return alone. Put everything the parent needs in that bounded capsule.",
  ].join("\n\n");
}

export class PiChildExecutor implements ChildExecutor {
  private modelRuntime?: Promise<ModelRuntime>;

  constructor(private readonly store: ScopeStore) {}

  async run(request: ChildRunRequest): Promise<ChildExecutionResult> {
    if (request.scope.workspaceMode !== "docker-copy") return this.runSession(request);
    request.signal.throwIfAborted();
    if (!request.parent.model) return { status: "failed", error: "The parent has no selected model", usage: emptyUsage() };
    let runtime: DockerRuntime | undefined;
    let result: ChildExecutionResult = { status: "failed", usage: emptyUsage() };
    let commandFailure: string | undefined;
    try {
      if (!request.scope.runtime.scratchPath || !request.scope.runtime.image) throw new Error("Docker execution requires owned scratch and a pinned image");
      const input = path.join(request.scope.runtime.scratchPath, "input");
      const snapshot = await snapshotProject(request.scope.cwd, input, request.signal);
      const inputRoot = await realpath(input);
      const copiedCwd = path.join(inputRoot, ...path.posix.relative("/workspace", snapshot.cwd).split("/"));
      const guidance = !request.snapshot && request.repoInstructions !== false
        ? (await projectGuidance(copiedCwd, inputRoot)).map((file) => ({ ...file, path: path.posix.join("/workspace", ...path.relative(inputRoot, file.path).split(path.sep)) })) : [];
      request.scope.runtime.sourceRevision = snapshot.commit;
      const { manifest: _manifest, ...workspaceInfo } = snapshot;
      await this.store.appendTrace(request.scope.id, "scope.workspace", workspaceInfo);
      request.signal.throwIfAborted();
      runtime = await DockerRuntime.create(request.scope.runtime.image, async (name) => {
        request.scope.runtime.containerName = name;
        await this.store.saveScope(request.scope);
      }, request.signal, request.scope.runtime.dockerPolicy);
      await this.store.appendTrace(request.scope.id, "docker.created", { name: runtime.name, image: request.scope.runtime.image });
      request.signal.throwIfAborted();
      await runtime.importDirectory(input, request.signal);
      request.signal.throwIfAborted();
      const capabilities = await runtime.capabilities(request.scope.runtime.dockerPolicy ?? dockerPolicy({}), request.signal);
      request.scope.runtime.capabilities = capabilities;
      await this.store.saveScope(request.scope);
      await this.store.appendTrace(request.scope.id, "scope.capabilities", capabilities);
      request.onActivity?.(capabilities.summary);
      result = await this.runSession(request, { cwd: snapshot.cwd, sourceRoot: snapshot.root, guidance,
        bash: dockerBash(runtime, snapshot.cwd, this.store, request.scope.id, (error) => { commandFailure = error; }) });
      if (commandFailure && !request.signal.aborted) result = { ...result, status: "failed", error: commandFailure };
      if (!request.signal.aborted && runtime) {
        try {
          const patch = await captureWorkspacePatch({
            runtime,
            repoRoot: snapshot.root,
            inputDir: input,
            sourceRevision: snapshot.commit,
            manifest: snapshot.manifest,
            signal: request.signal,
          });
          if (patch.status === "captured") {
            const blobRef = await this.store.saveEvidenceBlob(request.scope.id, Buffer.from(patch.patchText, "utf8"));
            result.patch = {
              status: "captured",
              blobRef,
              sourceRevision: snapshot.commit,
              files: patch.files.slice(0, 20),
              stats: patch.stats,
            };
            await this.store.appendTrace(request.scope.id, "scope.patch", result.patch);
          } else {
            result.patch = {
              status: "no-change",
              sourceRevision: snapshot.commit,
            };
            await this.store.appendTrace(request.scope.id, "scope.patch", result.patch);
          }
        } catch (patchError) {
          const message = patchError instanceof Error ? patchError.message : String(patchError);
          result.status = request.signal.aborted ? "cancelled" : "failed";
          result.error = [result.error, `Workspace patch capture failed: ${message}`].filter(Boolean).join("; ");
          result.patch = {
            status: request.signal.aborted ? "unavailable" : "error",
            error: message,
            sourceRevision: snapshot.commit,
          };
          await this.store.appendTrace(request.scope.id, "scope.patch", result.patch);
        }
      } else if (request.signal.aborted) {
        result.patch = {
          status: "unavailable",
          error: "Runtime was cancelled before patch capture.",
          sourceRevision: snapshot.commit,
        };
      }
    } catch (error) {
      result = { ...result, status: request.signal.aborted ? "cancelled" : "failed", error: error instanceof Error ? error.message : String(error) };
      if (!result.patch && request.scope.workspaceMode === "docker-copy") {
        result.patch = {
          status: "unavailable",
          error: request.signal.aborted ? "Runtime was cancelled before patch capture." : (error instanceof Error ? error.message : String(error)),
          ...(request.scope.runtime.sourceRevision ? { sourceRevision: request.scope.runtime.sourceRevision } : {}),
        };
      }
    } finally {
      if (request.scope.runtime.containerName) {
        try {
          if (runtime) await runtime.dispose();
          else await DockerRuntime.recover(request.scope.runtime.containerName);
          request.scope.runtime.state = "disposed";
        } catch (error) {
          request.scope.runtime.state = "cleanup-failed";
          result = { ...result, status: "failed", error: `Docker cleanup unverified for ${request.scope.runtime.containerName}: ${error instanceof Error ? error.message : String(error)}` };
        }
        await this.store.saveScope(request.scope);
      }
    }
    return result;
  }

  private async runSession(request: ChildRunRequest, environment?: { cwd: string; sourceRoot: string; guidance: { path: string; content: string }[]; bash: ToolDefinition<any> }): Promise<ChildExecutionResult> {
    request.signal.throwIfAborted();
    if (!request.parent.model) {
      return { status: "failed", error: "The parent has no selected model", usage: emptyUsage() };
    }

    let captured: ResultCapsuleInput | undefined;
    let capturedStatus: "completed" | "partial" = "completed";
    const returnTool = createScopeReturnTool((capsule, outcome) => {
      captured = capsule;
      capturedStatus = outcome === "partial" ? "partial" : "completed";
    });
    const cwd = environment?.cwd ?? request.scope.cwd;
    const scopedBash = environment?.bash ?? createBashToolDefinition(cwd, {
      spawnHook: ({ command, cwd, env }) => ({
        command,
        cwd,
        env: {
          ...env,
          PI_SCOPE_ID: request.scope.id,
          PI_SCOPE_PARENT_ID: request.scope.parentId ?? "",
          PI_SCOPE_KIND: request.scope.kind,
          AGENT_WORKSPACE: request.scope.cwd,
          AGENT_SCRATCH: request.scope.runtime.scratchPath ?? "",
        },
      }),
    });

    const inherited = new Set(request.snapshot?.entries.map((entry) => entry.id) ?? []);
    const childSessionManager = SessionManager.inMemory(cwd, undefined, request.snapshot?.entries);
    const agentDir = getAgentDir();
    const guidance = environment?.guidance ?? (!request.snapshot && request.repoInstructions !== false ? await projectGuidance(request.scope.cwd) : []);
    await this.store.appendTrace(request.scope.id, "scope.context", {
      mode: request.scope.context ?? "fresh",
      guidance: request.snapshot ? "inherited system prompt" : request.repoInstructions === false ? "disabled" : "project files",
      paths: guidance.map((file) => file.path),
      ...(request.snapshot ? { parentSessionId: request.snapshot.parentSessionId, parentEntryId: request.snapshot.parentEntryId } : {}),
    });
    request.signal.throwIfAborted();
    const settings = SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 1 },
    });
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: settings,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      agentsFilesOverride: () => ({ agentsFiles: guidance }),
      appendSystemPrompt: request.snapshot ? [] : [childInstructions(request.scope, environment)],
      ...(request.snapshot ? { systemPromptOverride: () => `${request.snapshot!.systemPrompt}\n\n# Current child assignment (overrides parent orchestration instructions)\n${childInstructions(request.scope, environment)}` } : {}),
    });
    await loader.reload();

    const runtime = await (this.modelRuntime ??= ModelRuntime.create({
      authPath: path.join(agentDir, "auth.json"),
      modelsPath: path.join(agentDir, "models.json"),
      refreshOnCreate: false,
    }));
    const { session } = await createAgentSession({
      cwd,
      agentDir,
      model: request.parent.model,
      ...(request.parent.thinkingLevel ? { thinkingLevel: request.parent.thinkingLevel } : {}),
      modelRuntime: runtime,
      tools: environment ? ["bash", "scope_return"] : ["read", "bash", "grep", "find", "ls", "scope_return"],
      customTools: [scopedBash, returnTool] as ToolDefinition<any, any, any>[],
      resourceLoader: loader,
      sessionManager: childSessionManager,
      settingsManager: settings,
    });

    const recorder = new ChildTraceRecorder(this.store, request.scope.id);
    recorder.attach(session, request.onActivity);
    const abort = () => void session.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    let turns = 0;
    let returning = false;
    let limitReached = false;
    const unsubscribe = session.subscribe((event) => {
      if (event.type !== "turn_end" || captured) return;
      if (++turns >= (returning ? 2 : request.scope.budget.maxTurns ?? 8)) {
        limitReached = true;
        // Stop only at a completed turn boundary; keep tool calls/results paired.
        session.agent.abort();
      }
    });
    try {
      request.signal.throwIfAborted();
      await session.prompt(`Investigate this goal and return a result capsule:\n\n${request.scope.goal}`);
      if (limitReached && !captured && !request.signal.aborted) {
        returning = true;
        turns = 0;
        await this.store.appendTrace(request.scope.id, "scope.wind_down", { reason: "Investigation turn allowance exhausted" });
        session.setActiveToolsByName(["scope_return"]);
        request.signal.throwIfAborted();
        await session.prompt("Investigation allowance exhausted. No more work tools are available. Call scope_return alone now using only evidence already gathered. Use outcome partial and list unresolved questions if the goal is not answered. You have at most two return turns, including any validation repair.");
      }
      const usage = collectUsage(session, inherited);
      const finalText = recorder.getFinalText();
      if (request.signal.aborted) {
        return { status: "cancelled", ...(finalText ? { finalText } : {}), usage };
      }
      if (captured) {
        return { status: capturedStatus, capsuleInput: captured, ...(finalText ? { finalText } : {}), usage };
      }

      const fallbackReason = returning ? "The return allowance ended without a valid scope_return." : "The child ended without calling scope_return.";
      return {
        status: finalText ? "partial" : "failed",
        fallbackReason,
        capsuleInput: fallbackCapsuleInput(finalText, fallbackReason),
        ...(finalText ? { finalText } : {}),
        ...(!finalText ? { error: "The child produced no final text or result capsule" } : {}),
        usage,
      };
    } catch (error) {
      const finalText = recorder.getFinalText();
      if (request.signal.aborted) {
        return { status: "cancelled", ...(finalText ? { finalText } : {}), usage: collectUsage(session, inherited) };
      }
      return {
        status: "failed",
        capsuleInput: fallbackCapsuleInput(finalText, "The child failed before returning a valid capsule."),
        ...(finalText ? { finalText } : {}),
        error: error instanceof Error ? error.message : String(error),
        usage: collectUsage(session, inherited),
      };
    } finally {
      unsubscribe();
      request.signal.removeEventListener("abort", abort);
      try {
        await recorder.flush();
      } finally {
        recorder.detach();
        session.dispose();
      }
    }
  }
}
