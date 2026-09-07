import type { ContextMode, ResultCapsule, ScopeRecord, ScopeStatus, WorkspaceMode } from "./types.js";
import { SCOPE_SCHEMA_VERSION } from "./types.js";
import type { ScopeStore } from "../storage/scope-store.js";
import { DockerRuntime } from "../runtime/docker.js";

export class ScopeManager {
  private readonly scopes = new Map<string, ScopeRecord>();

  constructor(private readonly store: ScopeStore, private readonly cwd: string) {}

  async initialize(): Promise<void> {
    for (const record of await this.store.listScopes()) {
      let cleanupError: string | undefined;
      if (record.workspaceMode === "docker-copy" && record.runtime.containerName && record.runtime.state !== "disposed") {
        try {
          await DockerRuntime.recover(record.runtime.containerName);
          record.runtime.state = "disposed";
          await this.store.appendTrace(record.id, "docker.reconciled", { name: record.runtime.containerName });
        } catch (error) {
          cleanupError = `Docker cleanup unverified for ${record.runtime.containerName}: ${error instanceof Error ? error.message : String(error)}`;
          record.runtime.state = "cleanup-failed";
          record.error = cleanupError;
          await this.store.appendTrace(record.id, "docker.cleanup_failed", { error: cleanupError });
        }
        await this.store.saveScope(record);
      }
      if (record.kind === "subsession" && record.status === "active") {
        const message = "The host stopped before this child reached a terminal state; v0.1 does not resume child runtimes." + (cleanupError ? ` ${cleanupError}` : "");
        const capsule: ResultCapsule = {
          status: "failed",
          scopeId: record.id,
          traceRef: record.traceRef,
          workspaceMode: record.workspaceMode,
          summary: "The child was interrupted before producing a result capsule.",
          unresolved: [message],
          fallbackReason: message,
          error: message,
          ...(record.workspaceMode === "docker-copy" ? {
            patch: {
              status: "unavailable",
              error: message,
              ...(record.runtime.sourceRevision ? { sourceRevision: record.runtime.sourceRevision } : {}),
            },
          } : {}),
        };
        await this.store.removeScratch(record.id);
        await this.store.appendTrace(record.id, "scope.interrupted", { error: message });
        const resultRef = await this.store.saveResult(capsule);
        const interrupted: ScopeRecord = {
          ...record,
          status: "failed",
          resultRef,
          error: message,
          runtime: { ...record.runtime, state: cleanupError ? "cleanup-failed" : "disposed" },
          updatedAt: new Date().toISOString(),
        };
        this.scopes.set(record.id, interrupted);
        await this.store.saveScope(interrupted);
      } else {
        this.scopes.set(record.id, record);
      }
    }
    const now = new Date().toISOString();
    const root: ScopeRecord = {
      schemaVersion: SCOPE_SCHEMA_VERSION,
      id: "root",
      parentId: null,
      kind: "root",
      goal: "Pi root session",
      status: "active",
      workspaceMode: "host-shared",
      cwd: this.cwd,
      budget: { timeoutMs: 0 },
      runtime: { state: "active" },
      traceRef: this.store.traceRef("root"),
      createdAt: this.scopes.get("root")?.createdAt ?? now,
      updatedAt: now,
    };
    this.scopes.set(root.id, root);
    await this.store.saveScope(root);
  }

  list(): ScopeRecord[] {
    return [...this.scopes.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(scopeId: string): ScopeRecord | undefined {
    return this.scopes.get(scopeId);
  }

  activeChild(): ScopeRecord | undefined {
    return this.list().find((scope) => scope.parentId === "root" && scope.status === "active");
  }

  async createChild(id: string, goal: string, timeoutMs: number, scratchPath: string, maxTurns = 8, context: ContextMode = "fresh", workspaceMode: WorkspaceMode = "host-shared", image?: string): Promise<ScopeRecord> {
    if (this.activeChild()) throw new Error("v0.1 permits only one active child");
    const now = new Date().toISOString();
    const record: ScopeRecord = {
      schemaVersion: SCOPE_SCHEMA_VERSION,
      id,
      parentId: "root",
      kind: "subsession",
      goal,
      context,
      status: "active",
      workspaceMode,
      cwd: this.cwd,
      budget: { timeoutMs, maxTurns },
      runtime: { state: "active", scratchPath, ...(image ? { image } : {}) },
      traceRef: this.store.traceRef(id),
      createdAt: now,
      updatedAt: now,
    };
    this.scopes.set(id, record);
    await this.store.saveScope(record);
    return record;
  }

  async finish(scopeId: string, status: Exclude<ScopeStatus, "active">, resultRef: string, error?: string): Promise<ScopeRecord> {
    const current = this.required(scopeId);
    const next: ScopeRecord = {
      ...current,
      status,
      resultRef,
      updatedAt: new Date().toISOString(),
      ...(error ? { error } : {}),
    };
    this.scopes.set(scopeId, next);
    await this.store.saveScope(next);
    return next;
  }

  async disposeRuntime(scopeId: string): Promise<ScopeRecord> {
    const current = this.required(scopeId);
    const next: ScopeRecord = {
      ...current,
      runtime: { ...current.runtime, state: "disposed" },
      updatedAt: new Date().toISOString(),
    };
    this.scopes.set(scopeId, next);
    await this.store.saveScope(next);
    return next;
  }

  private required(scopeId: string): ScopeRecord {
    const scope = this.scopes.get(scopeId);
    if (!scope) throw new Error(`Unknown scope: ${scopeId}`);
    return scope;
  }
}
