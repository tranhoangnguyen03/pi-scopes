import path from "node:path";
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

export interface ChildRunRequest {
  scope: ScopeRecord;
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

function collectUsage(session: AgentSession): ChildUsage {
  const total = emptyUsage();
  // Count persisted entries, including history and summary calls removed by compaction.
  for (const entry of session.sessionManager.getEntries()) {
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

function childInstructions(scope: ScopeRecord): string {
  return [
    "You are a focused child session working for a parent Pi agent.",
    `Goal: ${scope.goal}`,
    `Scope ID: ${scope.id}`,
    `Workspace mode: ${scope.workspaceMode}. The workspace is shared with the parent and is not a security boundary.`,
    `Use ${scope.runtime.scratchPath ?? "the assigned scratch directory"} for temporary scripts, downloads, and logs.`,
    "Investigate only the assigned goal. Preserve concrete evidence such as paths, symbols, commands, and test results.",
    "You do not see the parent conversation. If the goal omits essential context, return partial with the missing information; do not guess the reported problem.",
    `You have at most ${scope.budget.maxTurns ?? 8} investigation turns. Stop once you have enough evidence; this is an allowance, not a target.`,
    "Do not assume your transcript will enter the parent context.",
    "When done, call scope_return alone. Put everything the parent needs in that bounded capsule.",
  ].join("\n\n");
}

export class PiChildExecutor implements ChildExecutor {
  private modelRuntime?: Promise<ModelRuntime>;

  constructor(private readonly store: ScopeStore) {}

  async run(request: ChildRunRequest): Promise<ChildExecutionResult> {
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
    const scopedBash = createBashToolDefinition(request.scope.cwd, {
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

    const agentDir = getAgentDir();
    const settings = SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 1 },
    });
    const loader = new DefaultResourceLoader({
      cwd: request.scope.cwd,
      agentDir,
      settingsManager: settings,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      appendSystemPrompt: [childInstructions(request.scope)],
    });
    await loader.reload();

    const runtime = await (this.modelRuntime ??= ModelRuntime.create({
      authPath: path.join(agentDir, "auth.json"),
      modelsPath: path.join(agentDir, "models.json"),
      refreshOnCreate: false,
    }));
    const { session } = await createAgentSession({
      cwd: request.scope.cwd,
      agentDir,
      model: request.parent.model,
      ...(request.parent.thinkingLevel ? { thinkingLevel: request.parent.thinkingLevel } : {}),
      modelRuntime: runtime,
      tools: ["read", "bash", "grep", "find", "ls", "scope_return"],
      customTools: [scopedBash, returnTool] as ToolDefinition<any, any, any>[],
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(request.scope.cwd),
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
      const usage = collectUsage(session);
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
        return { status: "cancelled", ...(finalText ? { finalText } : {}), usage: collectUsage(session) };
      }
      return {
        status: "failed",
        capsuleInput: fallbackCapsuleInput(finalText, "The child failed before returning a valid capsule."),
        ...(finalText ? { finalText } : {}),
        error: error instanceof Error ? error.message : String(error),
        usage: collectUsage(session),
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
