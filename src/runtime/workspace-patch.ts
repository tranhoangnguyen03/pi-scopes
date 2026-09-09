import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DockerRuntime } from "./docker.js";
import type { SnapshotFileMeta } from "./project-snapshot.js";
import type { PatchStats } from "../core/types.js";

const MAX_EXPORT_FILES = 10_000;
const MAX_EXPORT_BYTES = 12 * 1024 * 1024;

export interface GuestFile {
  mode: "100644" | "100755";
  content: Buffer;
}

export interface CapturedPatch {
  status: "captured";
  patchText: string;
  files: string[];
  stats: PatchStats;
  sourceRevision: string;
}

export interface NoChangePatch {
  status: "no-change";
  sourceRevision: string;
}

export type WorkspacePatchResult = CapturedPatch | NoChangePatch;

function safePath(name: string): string {
  const normalized = name.startsWith("./") ? name.slice(2) : name;
  if (!/^[A-Za-z0-9_./-]+$/.test(normalized) || normalized.startsWith("/") ||
      normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Unsafe or unsupported path in guest workspace");
  }
  if (normalized.split("/").some((part) => part.toLowerCase() === ".git")) {
    throw new Error("Unsafe path: .git administration is not permitted");
  }
  return normalized;
}

export function parseWorkspaceTar(buffer: Buffer, options: { maxFiles?: number; maxBytes?: number } = {}): Map<string, GuestFile> {
  if (buffer.length > 20 * 1024 * 1024) throw new Error("Docker workspace export limit exceeded");
  const files = new Map<string, GuestFile>();
  const seen = new Set<string>();
  let totalBytes = 0;
  let entries = 0;
  let offset = 0;
  const text = (block: Buffer, start: number, end: number) => {
    const bytes = block.subarray(start, end);
    const nul = bytes.indexOf(0);
    const value = bytes.subarray(0, nul < 0 ? bytes.length : nul);
    if (!Buffer.from(value.toString("utf8")).equals(value)) throw new Error("Invalid UTF-8 tar header");
    return value.toString("utf8");
  };
  const octal = (block: Buffer, start: number, end: number) => {
    const value = text(block, start, end).trim();
    if (!/^[0-7]+$/.test(value)) throw new Error("Invalid tar numeric header");
    return parseInt(value, 8);
  };
  while (offset + 512 <= buffer.length) {
    const block = buffer.subarray(offset, offset + 512);
    if (block.every((byte) => byte === 0)) {
      if (buffer.length < offset + 1024 || buffer.length % 512 ||
          !buffer.subarray(offset).every((byte) => byte === 0)) throw new Error("Incomplete tar stream or trailing data");
      for (const name of files.keys()) {
        const parts = name.split("/");
        for (let i = 1; i < parts.length; i++) {
          if (files.has(parts.slice(0, i).join("/"))) throw new Error("Conflicting file and directory paths");
        }
      }
      return files;
    }
    if (++entries > 20_000) throw new Error("Docker workspace entry limit exceeded");
    const checksum = block.reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
    if (octal(block, 148, 156) !== checksum || text(block, 257, 263) !== "ustar") throw new Error("Invalid tar checksum or unsupported format");
    const prefix = text(block, 345, 500);
    const name = (prefix ? prefix + "/" : "") + text(block, 0, 100);
    const mode = octal(block, 100, 108);
    const size = octal(block, 124, 136);
    const type = block[156];
    offset += 512;
    const blockEnd = offset + Math.ceil(size / 512) * 512;
    if (blockEnd > buffer.length) throw new Error("Incomplete tar stream export from guest workspace");
    if (type !== 48 && type !== 0 && type !== 53) throw new Error("Unsafe entry: symlinks and special files or extended headers are not permitted");
    if (type === 53 && size !== 0) throw new Error("Invalid directory size");
    if (!(type === 53 && (name === "./" || name === "."))) {
      const normalized = safePath(type === 53 ? name.replace(/\/$/, "") : name);
      if (seen.has(normalized)) throw new Error("Duplicate tar path");
      seen.add(normalized);
      if (type !== 53) {
        totalBytes += size;
        if (files.size + 1 > (options.maxFiles ?? MAX_EXPORT_FILES) || totalBytes > (options.maxBytes ?? MAX_EXPORT_BYTES)) throw new Error("Docker workspace export limit exceeded");
        files.set(normalized, { mode: mode & 0o111 ? "100755" : "100644", content: buffer.subarray(offset, offset + size) });
      }
    }
    offset = blockEnd;
  }
  throw new Error("Incomplete tar stream: missing end markers");
}

function filterIgnoredPaths(repoRoot: string, paths: string[], signal?: AbortSignal): Promise<Set<string>> {
  if (paths.length === 0) return Promise.resolve(new Set());
  signal?.throwIfAborted();
  const input = paths.join("\0") + "\0";
  return new Promise((resolve, reject) => {
    const child = execFile("git", [
      "-c", "core.fsmonitor=false",
      "-c", "core.hooksPath=/dev/null",
      "-c", "core.excludesFile=/dev/null",
      "-C", repoRoot,
      "check-ignore", "-z", "--stdin",
    ], {
      maxBuffer: 8 * 1024 * 1024, // Matches the bounded guest listing; ignored dependencies exceeded the old 2 MiB cap.
      encoding: "buffer",
      timeout: 15_000,
      killSignal: "SIGKILL",
      signal,
      env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1", GIT_OPTIONAL_LOCKS: "0" },
    }, (error, stdout) => {
      if (error && (error as unknown as { code: unknown }).code !== 1) return reject(error);
      if (stdout && stdout.length > 0) {
        const ignored = stdout.toString("utf8").split("\0").filter(Boolean);
        resolve(new Set(ignored));
      } else {
        resolve(new Set());
      }
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

export function generateUnifiedDiff(oldText: string, newText: string): { diff: string; additions: number; deletions: number } {
  if (oldText === newText) return { diff: "", additions: 0, deletions: 0 };
  let lines = 0;
  for (const text of [oldText, newText]) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n" && ++lines > 200_000) throw new Error("Workspace diff limit exceeded (200,000 combined lines per file)");
    }
  }
  const oldLines = oldText.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const newLines = newText.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let prefix = 0;
  while (prefix < Math.min(oldLines.length, newLines.length) && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < Math.min(oldLines.length, newLines.length) - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
  // ponytail: linear single-hunk diff; distant edits include their intervening lines. Patch cap fails explicitly, never truncates.
  const start = Math.max(0, prefix - 3);
  const endOld = oldLines.length - Math.max(0, suffix - 3);
  const endNew = newLines.length - Math.max(0, suffix - 3);
  const line = (sign: string, value: string) => sign + value + (value.endsWith("\n") ? "" : "\n\\ No newline at end of file\n");
  const range = (count: number) => count === 1 ? `${start + 1}` : `${count ? start + 1 : 0},${count}`;
  const deletions = oldLines.length - suffix - prefix;
  const additions = newLines.length - suffix - prefix;
  const diff = `@@ -${range(endOld - start)} +${range(endNew - start)} @@\n` +
    oldLines.slice(start, prefix).map((v) => line(" ", v)).join("") +
    oldLines.slice(prefix, oldLines.length - suffix).map((v) => line("-", v)).join("") +
    newLines.slice(prefix, newLines.length - suffix).map((v) => line("+", v)).join("") +
    oldLines.slice(oldLines.length - suffix, endOld).map((v) => line(" ", v)).join("");
  return { diff, additions, deletions };
}

function binary(content: Buffer): boolean {
  return content.includes(0) || !Buffer.from(content.toString("utf8")).equals(content);
}

export interface CaptureOptions {
  runtime: DockerRuntime;
  repoRoot: string;
  inputDir: string;
  sourceRevision: string;
  manifest: Map<string, SnapshotFileMeta>;
  signal?: AbortSignal;
}

export async function captureWorkspacePatch(options: CaptureOptions): Promise<WorkspacePatchResult> {
  const { runtime, repoRoot, inputDir, sourceRevision, manifest, signal } = options;
  signal?.throwIfAborted();

  const paths = await runtime.listWorkspace(signal);
  const ignoredPaths = await filterIgnoredPaths(repoRoot, paths.filter((name) => !manifest.has(name)), signal);
  const selected = paths.filter((name) => manifest.has(name) || !ignoredPaths.has(name));
  for (const name of selected) safePath(name);
  if (selected.length > MAX_EXPORT_FILES) throw new Error("Docker workspace export file limit exceeded");
  const tarBuffer = await runtime.exportWorkspace(signal, selected);
  signal?.throwIfAborted();

  const guestFiles = parseWorkspaceTar(tarBuffer);
  if (guestFiles.size !== selected.length || selected.some((name) => !guestFiles.has(name))) throw new Error("Guest export does not match selected file manifest");

  // Classify paths
  const allPaths = new Set([...manifest.keys(), ...guestFiles.keys()]);
  const sortedPaths = [...allPaths].sort((a, b) => a.localeCompare(b));


  let totalAdditions = 0;
  let totalDeletions = 0;
  const changedFiles: string[] = [];
  let fullPatch = "";
  let checkedLength = 0;
  let patchBytes = 0;
  const checkSize = () => {
    patchBytes += Buffer.byteLength(fullPatch.slice(checkedLength));
    checkedLength = fullPatch.length;
    if (patchBytes > 4 * 1024 * 1024) throw new Error("Workspace patch limit exceeded (4 MiB)");
  };

  for (const filePath of sortedPaths) {
    signal?.throwIfAborted();

    safePath(filePath);
    checkSize();
    const isTracked = manifest.has(filePath);
    const inGuest = guestFiles.has(filePath);

    // Added file
    if (!isTracked && inGuest) {
      if (ignoredPaths.has(filePath)) {
        // Ignored generated cache: do not include in patch
        continue;
      }
      const guest = guestFiles.get(filePath)!;
      if (binary(guest.content)) {
        throw new Error(`Binary file changes are not supported: ${filePath}`);
      }
      changedFiles.push(filePath);
      const text = guest.content.toString("utf8");
      const { diff, additions } = generateUnifiedDiff("", text);
      totalAdditions += additions;
      fullPatch += `diff --git a/${filePath} b/${filePath}\n`;
      fullPatch += `new file mode ${guest.mode}\n`;
      fullPatch += `--- /dev/null\n`;
      fullPatch += `+++ b/${filePath}\n`;
      fullPatch += diff;
      continue;
    }

    // Deleted file
    if (isTracked && !inGuest) {
      const origMeta = manifest.get(filePath)!;
      const origPath = path.join(inputDir, ...filePath.split("/"));
      const origContent = await readFile(origPath);
      if (binary(origContent)) {
        throw new Error(`Binary file changes are not supported: ${filePath}`);
      }
      changedFiles.push(filePath);
      const text = origContent.toString("utf8");
      const { diff, deletions } = generateUnifiedDiff(text, "");
      totalDeletions += deletions;
      fullPatch += `diff --git a/${filePath} b/${filePath}\n`;
      fullPatch += `deleted file mode ${origMeta.mode}\n`;
      fullPatch += `--- a/${filePath}\n`;
      fullPatch += `+++ /dev/null\n`;
      fullPatch += diff;
      continue;
    }

    // Present in both: check mode and content
    if (isTracked && inGuest) {
      const origMeta = manifest.get(filePath)!;
      const guest = guestFiles.get(filePath)!;
      const modeChanged = origMeta.mode !== guest.mode;

      const origPath = path.join(inputDir, ...filePath.split("/"));
      const origContent = await readFile(origPath);
      const contentChanged = !origContent.equals(guest.content);

      if (!modeChanged && !contentChanged) {
        continue;
      }

      if (contentChanged && (binary(origContent) || binary(guest.content))) {
        throw new Error(`Binary file changes are not supported: ${filePath}`);
      }

      changedFiles.push(filePath);
      fullPatch += `diff --git a/${filePath} b/${filePath}\n`;
      if (modeChanged) {
        fullPatch += `old mode ${origMeta.mode}\n`;
        fullPatch += `new mode ${guest.mode}\n`;
      }

      if (contentChanged) {
        fullPatch += `--- a/${filePath}\n`;
        fullPatch += `+++ b/${filePath}\n`;
        const { diff, additions, deletions } = generateUnifiedDiff(
          origContent.toString("utf8"),
          guest.content.toString("utf8")
        );
        totalAdditions += additions;
        totalDeletions += deletions;
        fullPatch += diff;
      }
    }
  }

  checkSize();
  if (changedFiles.length === 0) {
    return {
      status: "no-change",
      sourceRevision,
    };
  }

  return {
    status: "captured",
    patchText: fullPatch,
    files: changedFiles,
    stats: {
      files: changedFiles.length,
      additions: totalAdditions,
      deletions: totalDeletions,
    },
    sourceRevision,
  };
}
