import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { fallbackCapsuleInput } from "./capsule.js";
import type { ChildExecutor } from "../child/pi-child-executor.js";
import type { ContextMode, ResultCapsule, ScopeRecord } from "./types.js";
import type { ParentSnapshot } from "../child/context.js";
import { acquireScratch, type ScratchLease } from "../runtime/scratch.js";
import { ScopeManager } from "./scope-manager.js";
import type { ScopeStore } from "../storage/scope-store.js";

export interface ForkOptions {
  goal: string;
  context?: ContextMode;
  snapshot?: ParentSnapshot;
  repoInstructions?: boolean;
  timeoutMs?: number;
  maxTurns?: number;
  parent: Pick<ExtensionContext, "model" | "thinkingLevel">;
  signal?: AbortSignal;
  onActivity?: (scope: ScopeRecord, label: string) => void;
}

export class ScopeKernel {
  readonly scopes: ScopeManager;
  private activeAbort: AbortController | undefined;

  constructor(readonly store: ScopeStore, readonly childExecutor: ChildExecutor, cwd: string) {
    this.scopes = new ScopeManager(store, cwd);
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
    await this.scopes.initialize();
  }

  async fork(options: ForkOptions): Promise<ResultCapsule> {
    if (process.platform !== "linux" && process.platform !== "darwin") {
      throw new Error(`pi-scopes v0.1 supports Linux and macOS, not ${process.platform}`);
    }
    const goal = options.goal.trim();
    if (!goal) throw new Error("A child goal is required");
    if (this.activeAbort) throw new Error("v0.1 permits only one active child");
    if (this.scopes.list().some((scope) => scope.runtime.state === "cleanup-failed")) throw new Error("Docker cleanup is unverified. Restore Docker and reload this session to reconcile before launching more work.");
    const execution = process.env.PI_SCOPES_EXECUTION ?? "host";
    if (execution !== "host" && execution !== "docker") throw new Error("PI_SCOPES_EXECUTION must be host or docker; no fallback was used.");
    const image = execution === "docker" ? process.env.PI_SCOPES_DOCKER_IMAGE : undefined;
    if (execution === "docker" && (!image || !/^sha256:[a-f0-9]{64}$/.test(image))) throw new Error("Docker mode requires PI_SCOPES_DOCKER_IMAGE set to a complete local sha256: image ID; no mutable tags or automatic pulls.");
    const workspaceMode = execution === "docker" ? "docker-copy" : "host-shared";

    const context = options.context ?? "fresh";
    if (context !== "fresh" && context !== "fork") throw new Error("context must be fresh or fork");
    if (context === "fork" && !options.snapshot) throw new Error("Fork context requires a parent snapshot");
    if (context === "fresh" && options.snapshot) throw new Error("Fresh context cannot contain a parent snapshot");
    if (context === "fork" && options.repoInstructions !== undefined) throw new Error("repoInstructions applies to fresh context only; fork reuses inherited guidance");
    const maxTurns = options.maxTurns ?? 8;
    if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 50) {
      throw new Error("maxTurns must be an integer between 1 and 50");
    }
    const timeoutMs = options.timeoutMs ?? 15 * 60_000;
    const scopeId = `sc_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    let scratch: ScratchLease | undefined;
    let scope: ScopeRecord | undefined;
    const controller = new AbortController();
    this.activeAbort = controller;

    const parentAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", parentAbort, { once: true });
    if (options.signal?.aborted) parentAbort();
    const timeout = setTimeout(() => controller.abort(new Error(`Scope exceeded ${timeoutMs}ms timeout`)), timeoutMs);

    try {
      const scratchPath = this.store.scratchPath(scopeId);
      scratch = await acquireScratch(scratchPath);
      scope = await this.scopes.createChild(scopeId, goal, timeoutMs, scratchPath, maxTurns, context, workspaceMode, image);
      await this.store.appendTrace(scope.id, "scope.fork", {
        parentId: scope.parentId,
        goal: scope.goal,
        context,
        workspaceMode: scope.workspaceMode,
        timeoutMs,
        maxTurns,
      });

      controller.signal.throwIfAborted();
      const execution = await this.childExecutor.run({
        scope,
        ...(options.snapshot ? { snapshot: options.snapshot } : {}),
        ...(options.repoInstructions !== undefined ? { repoInstructions: options.repoInstructions } : {}),
        parent: options.parent,
        signal: controller.signal,
        ...(options.onActivity ? { onActivity: (label) => options.onActivity?.(scope as ScopeRecord, label) } : {}),
      });
      const traceRef = this.store.traceRef(scope.id);
      const capsuleInput = execution.capsuleInput ?? fallbackCapsuleInput(execution.finalText, execution.error ?? "No structured result was returned.");
      const capsule: ResultCapsule = {
        ...capsuleInput,
        status: execution.status,
        context,
        workspaceMode,
        scopeId: scope.id,
        ...(scope.runtime.sourceRevision ? { sourceRevision: scope.runtime.sourceRevision } : {}),
        traceRef,
        usage: execution.usage,
        ...(execution.fallbackReason ? { fallbackReason: execution.fallbackReason }
          : execution.status !== "completed" && execution.status !== "partial"
            ? { fallbackReason: capsuleInput.unresolved?.[0] ?? "Structured return unavailable." } : {}),
        ...(execution.error ? { error: execution.error } : {}),
      };

      await this.store.appendTrace(scope.id, "scope.return", { capsule, usage: execution.usage });
      const resultRef = await this.store.saveResult(capsule);
      await this.scopes.finish(scope.id, execution.status, resultRef, execution.error);
      return capsule;
    } catch (error) {
      if (!scope) throw error;
      const status = controller.signal.aborted && scope.runtime.state !== "cleanup-failed" ? "cancelled" : "failed";
      const message = error instanceof Error ? error.message : String(error);
      const capsule: ResultCapsule = {
        ...fallbackCapsuleInput(undefined, message),
        status,
        context,
        workspaceMode,
        scopeId: scope.id,
        ...(scope.runtime.sourceRevision ? { sourceRevision: scope.runtime.sourceRevision } : {}),
        traceRef: this.store.traceRef(scope.id),
        fallbackReason: message,
        error: message,
      };
      await this.store.appendTrace(scope.id, `scope.${status}`, { error: message });
      const resultRef = await this.store.saveResult(capsule);
      await this.scopes.finish(scope.id, status, resultRef, message);
      return capsule;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", parentAbort);
      if (this.activeAbort === controller) this.activeAbort = undefined;
      if (scratch) await scratch.dispose();
      if (scope && scope.runtime.state !== "cleanup-failed") {
        await this.store.appendTrace(scope.id, "runtime.disposed", {});
        await this.scopes.disposeRuntime(scope.id);
      }
    }
  }

  async cancelActive(reason = "Cancelled by user or session lifecycle"): Promise<boolean> {
    if (!this.activeAbort) return false;
    this.activeAbort.abort(new Error(reason));
    return true;
  }
}
