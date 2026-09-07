import { mkdir, mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScopeStore } from "../src/storage/scope-store.js";
import { ScopeManager } from "../src/core/scope-manager.js";
import { readEvidence } from "../src/trace/evidence.js";
import { formatScopeTree } from "../src/ui/format.js";

let directory: string;
let store: ScopeStore;
const id = "sc_1234567890";
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "scope-evidence-"));
  store = new ScopeStore(directory, "session");
  await store.initialize();
  const scopes = new ScopeManager(store, directory);
  await scopes.initialize();
  await scopes.createChild(id, "Investigate a fixture", 1000, store.scratchPath(id));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

async function record(n: number, output = "recorded assertion failure", details = {}) {
  await store.appendTrace(id, "pi.tool_execution_start", { toolCallId: `call${n}`, toolName: "bash", args: { command: `echo ${n}` } });
  await store.appendTrace(id, "pi.tool_execution_end", { toolCallId: `call${n}`, toolName: "bash", isError: n === 1,
    result: { content: [{ type: "text", text: output }], details } });
}

describe("bounded recorded evidence", () => {
  it.each(["unavailable", "error", "no-change"] as const)("reads %s patch metadata even without a capture trace event", async (status) => {
    await store.saveResult({ scopeId: id, status: "cancelled", traceRef: store.traceRef(id), summary: "Stopped",
      patch: { status, sourceRevision: "abc123", ...(status !== "no-change" ? { error: "capture interrupted" } : {}) } });
    expect(await readEvidence(store, id)).toContain("1. workspace.patch");
    const result = await readEvidence(store, id, 1);
    expect(result).toContain(status);
    expect(result).toContain("abc123");
    if (status !== "no-change") expect(result).toContain("capture interrupted");
  });

  it("lists literal numbered records and reads paired arguments/results without assistant text", async () => {
    await record(1);
    await store.appendTrace(id, "pi.message_end", { message: { role: "assistant", content: "PRIVATE_THINKING" } });
    await store.appendTrace(id, "pi.tool_execution_start", { toolCallId: "return", toolName: "scope_return", args: {} });
    const index = await readEvidence(store, id);
    expect(index).toContain("1. bash");
    expect(index).toContain("error");
    expect(index).toContain('"action":"read"');
    const text = await readEvidence(store, id, 1);
    expect(text).toContain("echo 1");
    expect(text).toContain("recorded assertion failure");
    expect(text).toContain("Historical");
    expect(index + text).not.toContain("PRIVATE_THINKING");
    expect(index).not.toContain("2. scope_return");
  });

  it.each([{ exitCode: 42, error: undefined, expected: "exit 42" }, { exitCode: null, error: "timeout:3", expected: "execution stopped" }])("preserves command outcome alongside an owned output blob: $expected", async ({ exitCode, error, expected }) => {
    const blobRef = await store.saveEvidenceBlob(id, Buffer.from("retained raw output"));
    await record(2, "bounded tail", { blobRef, exitCode, ...(error ? { error } : {}) });
    expect(await readEvidence(store, id)).toContain(expected);
    const result = await readEvidence(store, id, 1);
    expect(result).toContain(expected);
    expect(result).toContain("retained raw output");
    if (error) expect(result).toContain(error);
  });

  it("paginates indexes and Unicode output with ready-to-use continuation calls", async () => {
    for (let n = 1; n <= 11; n++) await record(n, "🙂".repeat(3000));
    const index = await readEvidence(store, id);
    expect(index).not.toContain("11. bash");
    expect(index).toContain('"page":2');
    expect(await readEvidence(store, id, undefined, 2)).toContain("11. bash");
    const text = await readEvidence(store, id, 1);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(8192);
    expect(text).toContain('"item":1,"page":2');
    expect(text).not.toContain("�");
    expect(await readEvidence(store, id, 1, 2)).toContain("🙂");
  });

  it("fits a typical ASCII record on one page and preserves mixed UTF-8 across byte boundaries", async () => {
    await record(1, "x".repeat(4000));
    const ascii = await readEvidence(store, id, 1);
    expect(ascii).toContain("page 1/1");
    expect(ascii).toContain("[End of recorded item]");
    const content = "a".repeat(5977) + "🙂é漢".repeat(1700);
    await record(2, content);
    let combined = "";
    for (let page = 1; ; page++) {
      const rendered = await readEvidence(store, id, 2, page);
      expect(Buffer.byteLength(rendered)).toBeLessThanOrEqual(8192);
      expect(rendered).not.toContain("�");
      combined += rendered.split(/Call: [^\n]*\n\n/)[1]!.split(/\n\n\[(?:More|End)/)[0];
      if (rendered.includes("[End of recorded item]")) break;
      expect(rendered).toContain(`"page":${page + 1}`);
    }
    expect(combined).toBe(`Arguments:\n${JSON.stringify({ command: "echo 2" }, null, 2)}\n\nRecorded output:\n${content}`);
  });

  it("keeps scope/evidence indexes bounded and numbering stable after reopening", async () => {
    const manager = new ScopeManager(store, directory);
    await manager.initialize();
    for (let n = 1; n <= 11; n++) {
      await manager.createChild(`sc_extra${n}`, "🙂".repeat(2000), 1000, "unused");
      await manager.finish(`sc_extra${n}`, "completed", "unused");
      await store.appendTrace(id, "pi.tool_execution_start", { toolName: "🙂".repeat(100), toolCallId: `long${n}`, args: { command: "🙂".repeat(2000) } });
      await store.appendTrace(id, "pi.tool_execution_end", { toolCallId: `long${n}`, result: { content: [{ type: "text", text: "🙂".repeat(2000) }] } });
    }
    await store.saveResult({ scopeId: id, status: "partial", traceRef: store.traceRef(id), summary: "🙂".repeat(4000) });
    expect(Buffer.byteLength(formatScopeTree(manager.list()))).toBeLessThanOrEqual(8192);
    expect(formatScopeTree(manager.list())).toContain('"page":2');
    expect(Buffer.byteLength(await readEvidence(store, id))).toBeLessThanOrEqual(8192);
    const reopened = new ScopeStore(directory, "session");
    await reopened.initialize();
    expect(await readEvidence(reopened, id, 1)).toEqual(await readEvidence(store, id, 1));
  });

  it("pairs results by occurrence when a provider reuses a tool-call ID", async () => {
    await record(1, "FIRST_RESULT");
    await record(1, "SECOND_RESULT");
    expect(await readEvidence(store, id, 1)).toContain("FIRST_RESULT");
    expect(await readEvidence(store, id, 1)).not.toContain("SECOND_RESULT");
    expect(await readEvidence(store, id, 2)).toContain("SECOND_RESULT");
  });

  it("does not guess pairings for overlapping or missing call IDs", async () => {
    for (const command of ["first", "second"]) await store.appendTrace(id, "pi.tool_execution_start", { toolName: "bash", toolCallId: "duplicate", args: { command } });
    await store.appendTrace(id, "pi.tool_execution_end", { toolCallId: "duplicate", result: { content: [{ type: "text", text: "UNATTRIBUTABLE" }] } });
    for (const item of [1, 2]) {
      const text = await readEvidence(store, id, item);
      expect(text).toContain("ambiguous");
      expect(text).not.toContain("UNATTRIBUTABLE");
    }
    await store.appendTrace(id, "pi.tool_execution_start", { toolName: "bash", args: { command: "missing ID" } });
    await store.appendTrace(id, "pi.tool_execution_end", { result: { content: [{ type: "text", text: "UNATTRIBUTABLE" }] } });
    expect(await readEvidence(store, id, 3)).not.toContain("UNATTRIBUTABLE");
  });

  it("describes a missing completion without inventing an outcome", async () => {
    await store.appendTrace(id, "pi.tool_execution_start", { toolName: "bash", toolCallId: "unfinished", args: { command: "echo unfinished" } });
    expect(await readEvidence(store, id)).toContain("output unavailable");
    expect(await readEvidence(store, id, 1)).toContain("no tool completion was recorded");
  });

  it("reads a retained full-output blob after the original file is gone", async () => {
    const file = path.join(directory, "original.log");
    await writeFile(file, "FULL_RETAINED_OUTPUT");
    const blobRef = await store.copyBlob(id, file, "output.log");
    await unlink(file);
    await record(1, "TRUNCATED_EXCERPT", { blobRef, fullOutputPath: file });
    expect(await readEvidence(store, id, 1)).toContain("FULL_RETAINED_OUTPUT");
  });

  it("falls back to the saved excerpt when the retained blob cannot be read", async () => {
    const name = `${id}-unreadable.log`;
    await mkdir(path.join(store.sessionDir, "blobs", name));
    await record(1, "saved excerpt", { blobRef: `blob://session/${name}` });
    const text = await readEvidence(store, id, 1);
    expect(text).toContain("Full output unavailable");
    expect(text).toContain("saved excerpt");
  });

  it("never follows foreign blobs or arbitrary fullOutputPath references", async () => {
    const file = path.join(directory, "secret");
    await writeFile(file, "MUST_NOT_READ");
    await record(1, "saved excerpt", { blobRef: "blob://other/session.log", fullOutputPath: file });
    const text = await readEvidence(store, id, 1);
    expect(text).toContain("unavailable");
    expect(text).toContain("saved excerpt");
    expect(text).not.toContain("MUST_NOT_READ");
  });

  it("gives actionable missing-scope, missing-record and page errors", async () => {
    await expect(readEvidence(store, "../outside")).rejects.toThrow("scopeId");
    await expect(readEvidence(store, "sc_missing")).rejects.toThrow('"action":"inspect"');
    await expect(readEvidence(store, id, 1)).rejects.toThrow("No evidence item 1");
    await expect(readEvidence(store, id, 0)).rejects.toThrow("item");
    await expect(readEvidence(store, id, undefined, 0)).rejects.toThrow("page");
    await record(1);
    await expect(readEvidence(store, id, 1, 999)).rejects.toThrow("page");
  });
});
