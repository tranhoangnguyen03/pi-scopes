import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { snapshotParent } from "../src/child/context.js";
import { projectGuidance } from "../src/child/project-guidance.js";

let directory: string | undefined;
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined; });

describe("context snapshots and project guidance", () => {
  it("copies only the active branch before the unfinished run, without mutating the parent", () => {
    const sm = SessionManager.inMemory();
    const root = sm.appendMessage({ role: "user", content: "shared", timestamp: 1 });
    sm.appendMessage({ role: "user", content: "SIBLING_SECRET", timestamp: 2 });
    sm.branch(root);
    sm.appendMessage({ role: "user", content: "ACTIVE_BACKGROUND", timestamp: 3 });
    sm.appendMessage({ role: "assistant", content: [{ type: "toolCall", id: "running", name: "scope", arguments: { action: "run", context: "fork" } }],
      api: "openai-completions", provider: "fixture", model: "fixture", stopReason: "toolUse", timestamp: 4,
      usage: { input: 10, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 11, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    const before = JSON.stringify(sm.getEntries());
    const snapshot = snapshotParent({ sessionManager: sm, getSystemPrompt: () => "PARENT_RULES" }, "running");
    expect(JSON.stringify(snapshot)).toContain("ACTIVE_BACKGROUND");
    expect(JSON.stringify(snapshot)).not.toContain("SIBLING_SECRET");
    expect(JSON.stringify(snapshot)).not.toContain("running");
    expect(snapshot.systemPrompt).toBe("PARENT_RULES");
    snapshot.entries[0]!.id = "changed";
    expect(JSON.stringify(sm.getEntries())).toBe(before);
    expect(() => snapshotParent({ sessionManager: sm, getSystemPrompt: () => "" }, "missing")).toThrow("No child started");
  });

  it("loads root-to-cwd project rules with Pi filename precedence, excluding ancestors", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "scope-guidance-"));
    const repo = path.join(directory, "repo");
    const cwd = path.join(repo, "nested");
    await mkdir(path.join(repo, ".git"), { recursive: true });
    await mkdir(cwd);
    await writeFile(path.join(directory, "AGENTS.md"), "OUTSIDE_RULES");
    await writeFile(path.join(repo, "AGENTS.md"), "ROOT_RULES");
    await writeFile(path.join(repo, "CLAUDE.md"), "SHADOWED_RULES");
    await writeFile(path.join(cwd, "AGENTS.override.md"), "NESTED_RULES");
    const files = await projectGuidance(cwd);
    expect(files.map((file) => file.content)).toEqual(["ROOT_RULES", "NESTED_RULES"]);
    expect(files.map((file) => file.path)).toEqual([path.join(await realpath(repo), "AGENTS.md"), path.join(await realpath(cwd), "AGENTS.override.md")]);
  });

  it("uses cwd only outside Git, and rejects oversized or escaping guidance", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "scope-guidance-"));
    const cwd = path.join(directory, "plain");
    await mkdir(cwd);
    await writeFile(path.join(directory, "AGENTS.md"), "OUTSIDE");
    expect(await projectGuidance(cwd)).toEqual([]);
    const file = path.join(cwd, "AGENTS.md");
    await writeFile(file, "x".repeat(32_001));
    await expect(projectGuidance(cwd)).rejects.toThrow("32,000");
    await rm(file);
    await symlink(path.join(directory, "AGENTS.md"), file);
    await expect(projectGuidance(cwd)).rejects.toThrow("outside project");
    await rm(file);
    await symlink(path.join(directory, "missing"), file);
    await expect(projectGuidance(cwd)).rejects.toThrow();
  });
});
