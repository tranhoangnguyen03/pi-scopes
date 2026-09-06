import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import type { ChildExecutor } from "../src/child/pi-child-executor.js";
import { ScopeKernel } from "../src/core/scope-kernel.js";
import { ScopeStore } from "../src/storage/scope-store.js";

const temporaryDirectories: string[] = [];
const zeroUsage = {
  turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const parent = { model: {} } as Pick<ExtensionContext, "model" | "thinkingLevel">;

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function kernelWith(executor: ChildExecutor): Promise<ScopeKernel> {
  const base = await mkdtemp(path.join(tmpdir(), "pi-scopes-kernel-"));
  temporaryDirectories.push(base);
  const store = new ScopeStore(base, "kernel");
  const kernel = new ScopeKernel(store, executor, process.cwd());
  await kernel.initialize();
  return kernel;
}

describe("ScopeKernel", () => {
  it("returns a capsule, retains trace, and disposes runtime scratch", async () => {
    const executor: ChildExecutor = {
      async run(request) {
        expect(request.scope.runtime.scratchPath).toContain(request.scope.id);
        await access(request.scope.runtime.scratchPath as string);
        return {
          status: "completed",
          capsuleInput: { summary: "usable", evidence: [{ summary: "checked" }] },
          usage: { ...zeroUsage, turns: 1, input: 10, output: 4, totalTokens: 14, cost: { ...zeroUsage.cost, total: 0.01 } },
        };
      },
    };
    const kernel = await kernelWith(executor);

    const capsule = await kernel.fork({ goal: "test the lifecycle", parent });
    const scope = kernel.scopes.get(capsule.scopeId);

    expect(capsule).toMatchObject({ status: "completed", summary: "usable" });
    expect(scope).toMatchObject({ status: "completed", runtime: { state: "disposed" } });
    await expect(access(kernel.store.scratchPath(capsule.scopeId))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await kernel.store.readTrace(capsule.scopeId)).map((event) => event.type)).toEqual([
      "scope.fork",
      "scope.return",
      "runtime.disposed",
    ]);
  });

  it("propagates cancellation into the child and retains a cancelled result", async () => {
    const executor: ChildExecutor = {
      async run(request) {
        if (!request.signal.aborted) {
          await new Promise<void>((resolve) => request.signal.addEventListener("abort", () => resolve(), { once: true }));
        }
        return {
          status: "cancelled",
          usage: zeroUsage,
        };
      },
    };
    const kernel = await kernelWith(executor);
    const pending = kernel.fork({ goal: "wait for cancellation", parent });

    while (!kernel.scopes.activeChild()) await new Promise((resolve) => setTimeout(resolve, 1));
    expect(await kernel.cancelActive("test cancellation")).toBe(true);
    const capsule = await pending;

    expect(capsule.status).toBe("cancelled");
    expect(kernel.scopes.get(capsule.scopeId)?.runtime.state).toBe("disposed");
  });

  it("rejects overlapping forks without losing the active cancellation handle", async () => {
    const executor: ChildExecutor = {
      async run(request) {
        if (!request.signal.aborted) {
          await new Promise<void>((resolve) => request.signal.addEventListener("abort", () => resolve(), { once: true }));
        }
        return {
          status: "cancelled",
          usage: zeroUsage,
        };
      },
    };
    const kernel = await kernelWith(executor);
    const first = kernel.fork({ goal: "first", parent });

    await expect(kernel.fork({ goal: "second", parent })).rejects.toThrow("only one active child");
    expect(await kernel.cancelActive()).toBe(true);
    expect((await first).status).toBe("cancelled");
  });
});
