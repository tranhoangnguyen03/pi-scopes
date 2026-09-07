import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

function git(cwd: string, args: string[], signal: AbortSignal, input?: string): Promise<Buffer> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = execFile("git", ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-C", cwd, ...args], {
      encoding: "buffer", maxBuffer: 16 * 1024 * 1024, timeout: 30_000, killSignal: "SIGKILL", signal,
      env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1", GIT_OPTIONAL_LOCKS: "0" },
    }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

export async function snapshotProject(cwd: string, destination: string, signal: AbortSignal): Promise<{ root: string; commit: string; cwd: string; files: number; bytes: number }> {
  const start = await realpath(cwd);
  const root = await realpath((await git(start, ["rev-parse", "--show-toplevel"], signal)).toString().trim());
  const relative = path.relative(root, start);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Working directory is outside the Git project");
  const dirty = () => new Error("Docker mode requires a clean committed Git snapshot with literal committed bytes. Commit or separately preserve changes first; nothing was imported and host execution will not be used.");
  const missing = (error: unknown): never => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw dirty();
    throw error;
  };
  // git status/diff on working files can execute clean filters. Compare index metadata and
  // literal working bytes instead; cat-file without --filters never runs repository filters.
  if ((await git(root, ["ls-files", "--others", "--exclude-standard", "-z"], signal)).length) throw dirty();
  const commit = (await git(root, ["rev-parse", "--verify", "HEAD^{commit}"], signal)).toString().trim();
  try { await git(root, ["diff-index", "--cached", "--quiet", "--no-ext-diff", "--no-textconv", commit, "--"], signal); }
  catch { signal.throwIfAborted(); throw dirty(); }
  const listing = await git(root, ["ls-tree", "-rlz", "--full-tree", commit], signal);
  if (!Buffer.from(listing.toString("utf8")).equals(listing)) throw new Error("Snapshot paths must be valid UTF-8");
  const files = listing.toString().split("\0").filter(Boolean).map((entry) => {
    const tab = entry.indexOf("\t");
    const [mode, type, oid, size] = entry.slice(0, tab).trim().split(/\s+/);
    const name = entry.slice(tab + 1);
    if (tab < 0 || type !== "blob" || !["100644", "100755"].includes(mode!)) throw new Error("Snapshot supports regular files only; symlinks and submodules are not imported.");
    if (!oid || !/^[a-f0-9]{40,64}$/.test(oid) || !name || name.split("/").some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) throw new Error("Unsafe Git snapshot entry");
    const bytes = Number(size);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Invalid snapshot size");
    return { mode, oid, name, bytes };
  });
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  // ponytail: bounded in-memory Git export; use streaming import when larger projects are needed.
  if (bytes > 12 * 1024 * 1024 || files.length > 10_000) throw new Error("Docker snapshot limit is 12 MiB / 10,000 regular files. Narrow the project; no input was silently truncated.");
  const contents = files.length ? await git(root, ["cat-file", "--batch"], signal, files.map((file) => file.oid).join("\n") + "\n") : Buffer.alloc(0);
  await mkdir(destination, { mode: 0o700 });
  let offset = 0;
  for (const file of files) {
    signal.throwIfAborted();
    const newline = contents.indexOf(10, offset);
    const header = contents.subarray(offset, newline).toString();
    if (newline < offset || header !== `${file.oid} blob ${file.bytes}`) throw new Error("Unexpected Git object export");
    offset = newline + 1;
    if (contents[offset + file.bytes] !== 10) throw new Error("Incomplete Git object export");
    const parts = file.name.split("/");
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      parent = path.join(parent, part);
      const info = await lstat(parent).catch(missing);
      if (!info.isDirectory() || info.isSymbolicLink()) throw dirty();
    }
    const working = path.join(root, ...parts);
    const info = await lstat(working).catch(missing);
    if (!info.isFile() || info.size !== file.bytes || Boolean(info.mode & 0o111) !== (file.mode === "100755")) throw dirty();
    const handle = await open(working, constants.O_RDONLY | constants.O_NOFOLLOW).catch(missing);
    const current = Buffer.alloc(file.bytes + 1);
    let read = 0;
    try {
      while (read < current.length) {
        const next = await handle.read(current, read, current.length - read, read);
        if (!next.bytesRead) break;
        read += next.bytesRead;
      }
    } finally { await handle.close(); }
    if (!current.subarray(0, read).equals(contents.subarray(offset, offset + file.bytes))) throw dirty();
    const target = path.join(destination, ...parts);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, contents.subarray(offset, offset + file.bytes), { flag: "wx", mode: file.mode === "100755" ? 0o755 : 0o644 });
    offset += file.bytes + 1;
  }
  await mkdir(path.join(destination, relative), { recursive: true, mode: 0o700 });
  return { root, commit, cwd: path.posix.join("/workspace", ...relative.split(path.sep)), files: files.length, bytes };
}
