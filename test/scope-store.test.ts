import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DockerRuntime } from "../src/runtime/docker.js";
import { ScopeStore } from "../src/storage/scope-store.js";
import { ScopeManager } from "../src/core/scope-manager.js";
import { SCOPE_SCHEMA_VERSION, type ScopeRecord } from "../src/core/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryStore(sessionId = "session/unsafe"): Promise<{ base: string; store: ScopeStore }> {
  const base = await mkdtemp(path.join(tmpdir(), "pi-scopes-"));
  temporaryDirectories.push(base);
  const store = new ScopeStore(base, sessionId);
  await store.initialize();
  return { base, store };
}

describe("ScopeStore", () => {
  it("creates private session storage and sanitizes identifiers", async () => {
    const { store } = await temporaryStore();
    expect(store.sessionId).toBe("session_unsafe");
    expect((await stat(store.sessionDir)).mode & 0o777).toBe(0o700);
  });

  it("serializes trace events and resumes their sequence", async () => {
    const { base, store } = await temporaryStore("resume");
    await Promise.all([
      store.appendTrace("sc_one", "one", { value: 1n }),
      store.appendTrace("sc_one", "two", undefined),
    ]);

    const reopened = new ScopeStore(base, "resume");
    await reopened.initialize();
    await reopened.appendTrace("sc_one", "three", new Error("safe"));
    const events = await reopened.readTrace("sc_one");

    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(events[0]?.data).toEqual({ value: "1" });
    expect(events[1]?.data).toBeNull();
    expect(events[2]?.data).toMatchObject({ name: "Error", message: "safe" });
    expect((await readFile(reopened.tracePath("sc_one"), "utf8")).trim().split("\n")).toHaveLength(3);
  });

  it.each([true, false])("reconciles recorded Docker runtimes without claiming unverified cleanup: success=%s", async (success) => {
    const { store } = await temporaryStore("docker-recovery");
    const manager = new ScopeManager(store, process.cwd());
    await manager.initialize();
    const scope = await manager.createChild("sc_recover", "unfinished", 1000, store.scratchPath("sc_recover"), 8, "fresh", "docker-copy");
    scope.runtime.containerName = "pi-scopes-00000000-0000-0000-0000-000000000000";
    await store.saveScope(scope);
    const recovery = vi.spyOn(DockerRuntime, "recover");
    if (success) recovery.mockResolvedValue();
    else recovery.mockRejectedValue(new Error("Docker unavailable"));
    const reopened = new ScopeManager(store, process.cwd());
    await reopened.initialize();
    expect(recovery).toHaveBeenCalledWith(scope.runtime.containerName);
    expect(reopened.get(scope.id)).toMatchObject({ status: "failed", runtime: { state: success ? "disposed" : "cleanup-failed" } });
  });

  it("finalizes orphaned active children instead of resuming them", async () => {
    const { store } = await temporaryStore("orphan");
    const now = new Date().toISOString();
    const orphan: ScopeRecord = {
      schemaVersion: SCOPE_SCHEMA_VERSION,
      id: "sc_orphan",
      parentId: "root",
      kind: "subsession",
      goal: "unfinished",
      status: "active",
      workspaceMode: "host-shared",
      cwd: process.cwd(),
      budget: { timeoutMs: 1_000 },
      runtime: { state: "active", scratchPath: store.scratchPath("sc_orphan") },
      traceRef: store.traceRef("sc_orphan"),
      createdAt: now,
      updatedAt: now,
    };
    await store.saveScope(orphan);
    const manager = new ScopeManager(store, process.cwd());
    await manager.initialize();

    expect(manager.get("sc_orphan")).toMatchObject({ status: "failed", runtime: { state: "disposed" } });
    expect((await store.readResult("sc_orphan"))?.fallbackReason).toContain("does not resume");
    expect((await store.readTrace("sc_orphan")).at(-1)?.type).toBe("scope.interrupted");
  });
});
