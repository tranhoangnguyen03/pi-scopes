import path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { PiChildExecutor } from "./child/pi-child-executor.js";
import { ScopeKernel } from "./core/scope-kernel.js";
import type { ResultCapsule } from "./core/types.js";
import { ScopeStore } from "./storage/scope-store.js";
import { formatCapsule, formatScope, formatScopeTree, formatTrace } from "./ui/format.js";

const ScopeParameters = Type.Object({
  action: StringEnum(["inspect", "fork"] as const),
  goal: Type.Optional(Type.String({ minLength: 1, maxLength: 20_000 })),
  timeoutSeconds: Type.Optional(Type.Number({ minimum: 1, maximum: 3_600 })),
});

interface ScopeToolDetails {
  scopeId?: string;
  status?: string;
  traceRef?: string;
  capsule?: ResultCapsule;
}

export default function piScopes(pi: ExtensionAPI): void {
  let kernel: ScopeKernel | undefined;
  let initialization: Promise<ScopeKernel> | undefined;

  const ensureKernel = (ctx: ExtensionContext): Promise<ScopeKernel> => {
    const sessionId = ctx.sessionManager.getSessionId();
    if (kernel?.store.sessionId === sessionId) return Promise.resolve(kernel);
    if (initialization) return initialization;
    initialization = (async () => {
      const store = new ScopeStore(path.join(getAgentDir(), "scope-data"), sessionId);
      const created = new ScopeKernel(store, new PiChildExecutor(store), ctx.cwd);
      await created.initialize();
      kernel = created;
      return created;
    })().finally(() => {
      initialization = undefined;
    });
    return initialization;
  };

  pi.on("session_start", async (_event, ctx) => {
    await ensureKernel(ctx);
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    await kernel?.cancelActive("Parent Pi session shut down");
    await kernel?.store.flush();
    kernel = undefined;
  });

  pi.registerTool({
    name: "scope",
    label: "Scope",
    description: "Inspect scoped work or fork one foreground child with isolated conversation context. v0.1 uses the shared host workspace and supports one child at a time.",
    promptSnippet: "Fork or inspect a bounded child investigation",
    promptGuidelines: [
      "Use scope fork only for a substantial, focused investigation whose detailed execution would distract from the parent task.",
      "pi-scopes v0.1 children share the host workspace; do not treat them as sandboxed.",
    ],
    parameters: ScopeParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const activeKernel = await ensureKernel(ctx);
      if (params.action === "inspect") {
        return {
          content: [{ type: "text", text: formatScopeTree(activeKernel.scopes.list()) }],
          details: {},
        };
      }
      if (!params.goal?.trim()) throw new Error("scope fork requires a non-empty goal");

      const capsule = await activeKernel.fork({
        goal: params.goal,
        timeoutMs: Math.round((params.timeoutSeconds ?? 900) * 1000),
        parent: { model: ctx.model, ...(ctx.thinkingLevel ? { thinkingLevel: ctx.thinkingLevel } : {}) },
        ...(signal ? { signal } : {}),
        onActivity: (scope, label) => {
          onUpdate?.({
            content: [{ type: "text", text: `↳ ${scope.id}  ${label}` }],
            details: { scopeId: scope.id, status: "active", traceRef: scope.traceRef },
          });
        },
      });
      return {
        content: [{ type: "text", text: formatCapsule(capsule) }],
        details: { scopeId: capsule.scopeId, status: capsule.status, traceRef: capsule.traceRef, capsule },
      };
    },
    renderCall(args, theme) {
      return {
        render: () => [args.action === "fork" ? theme.fg("accent", `scope fork: ${args.goal ?? ""}`) : theme.fg("accent", "scope inspect")],
        invalidate: () => {},
      };
    },
    renderResult(result, options, theme) {
      const details = result.details as ScopeToolDetails | undefined;
      const label = details?.scopeId
        ? `${details.status === "completed" ? "✓" : "!"} ${details.scopeId} ${details.status ?? ""}`
        : "scope state";
      const expandedText = result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
      return {
        render: () => [theme.fg(details?.status === "completed" ? "success" : "accent", options.expanded ? expandedText : label)],
        invalidate: () => {},
      };
    },
  });

  pi.registerCommand("scope", {
    description: "Inspect pi-scopes state: tree, inspect, open, result, traces, cancel",
    handler: async (args, ctx) => {
      const activeKernel = await ensureKernel(ctx);
      const [action = "tree", scopeId] = args.trim().split(/\s+/, 2);
      if (action === "tree") {
        ctx.ui.notify(formatScopeTree(activeKernel.scopes.list()), "info");
        return;
      }
      if (action === "cancel") {
        const cancelled = await activeKernel.cancelActive();
        ctx.ui.notify(cancelled ? "Cancellation requested." : "No active child scope.", cancelled ? "info" : "warning");
        return;
      }
      if (!scopeId) {
        ctx.ui.notify(`Usage: /scope ${action} <scope-id>`, "warning");
        return;
      }
      const scope = activeKernel.scopes.get(scopeId) ?? await activeKernel.store.readScope(scopeId);
      if (!scope) {
        ctx.ui.notify(`Scope ${scopeId} not found.`, "error");
        return;
      }
      if (action === "inspect") {
        ctx.ui.notify(formatScope(scope), "info");
        return;
      }
      if (action === "result") {
        const result = await activeKernel.store.readResult(scopeId);
        ctx.ui.notify(result ? formatCapsule(result) : `No result for ${scopeId}.`, result ? "info" : "warning");
        return;
      }
      if (action === "open" || action === "traces") {
        const events = await activeKernel.store.readTrace(scopeId);
        ctx.ui.notify(formatTrace(events, activeKernel.store.tracePath(scopeId)), "info");
        return;
      }
      ctx.ui.notify("Unknown action. Use: tree, inspect, open, result, traces, cancel.", "warning");
    },
  });
}
