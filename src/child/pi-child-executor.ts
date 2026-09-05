import path from "node:path";
import {
  createAgentSession,
  createBashToolDefinition,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
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
  return { turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0 };
}

function collectUsage(messages: readonly unknown[]): ChildUsage {
  const total = emptyUsage();
  for (const message of messages) {
    if (typeof message !== "object" || message === null || (message as { role?: unknown }).role !== "assistant") continue;
    const usage = (message as { usage?: Record<string, unknown> }).usage;
    if (!usage) continue;
    total.turns += 1;
    total.inputTokens += typeof usage.input === "number" ? usage.input : 0;
    total.outputTokens += typeof usage.output === "number" ? usage.output : 0;
    total.cacheReadTokens += typeof usage.cacheRead === "number" ? usage.cacheRead : 0;
    total.cacheWriteTokens += typeof usage.cacheWrite === "number" ? usage.cacheWrite : 0;
    const cost = usage.cost;
    if (typeof cost === "object" && cost !== null && typeof (cost as { total?: unknown }).total === "number") {
      total.cost += (cost as { total: number }).total;
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
    "Do not assume your transcript will enter the parent context.",
    "When done, call scope_return alone. Put everything the parent needs in that bounded capsule.",
  ].join("\n\n");
}

export class PiChildExecutor implements ChildExecutor {
  private modelRuntime?: Promise<ModelRuntime>;

  constructor(private readonly store: ScopeStore) {}

  async run(request: ChildRunRequest): Promise<ChildExecutionResult> {
    if (!request.parent.model) {
      return { status: "failed", error: "The parent has no selected model", usage: emptyUsage() };
    }

    let captured: ResultCapsuleInput | undefined;
    const returnTool = createScopeReturnTool((capsule) => {
      captured = capsule;
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
    if (request.signal.aborted) abort();

    try {
      await session.prompt(`Investigate this goal and return a result capsule:\n\n${request.scope.goal}`);
      const usage = collectUsage(session.messages);
      const finalText = recorder.getFinalText();
      if (request.signal.aborted) {
        return { status: "cancelled", ...(finalText ? { finalText } : {}), usage };
      }
      if (captured) {
        return { status: "completed", capsuleInput: captured, ...(finalText ? { finalText } : {}), usage };
      }

      return {
        status: finalText ? "partial" : "failed",
        capsuleInput: fallbackCapsuleInput(finalText, "The child ended without calling scope_return."),
        ...(finalText ? { finalText } : {}),
        ...(!finalText ? { error: "The child produced no final text or result capsule" } : {}),
        usage,
      };
    } catch (error) {
      const finalText = recorder.getFinalText();
      if (request.signal.aborted) {
        return { status: "cancelled", ...(finalText ? { finalText } : {}), usage: collectUsage(session.messages) };
      }
      return {
        status: "failed",
        capsuleInput: fallbackCapsuleInput(finalText, "The child failed before returning a valid capsule."),
        ...(finalText ? { finalText } : {}),
        error: error instanceof Error ? error.message : String(error),
        usage: collectUsage(session.messages),
      };
    } finally {
      request.signal.removeEventListener("abort", abort);
      await recorder.flush();
      recorder.detach();
      session.dispose();
    }
  }
}
