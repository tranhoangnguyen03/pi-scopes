import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

// Pi 0.85.1 precedence; its loader also reads global/ancestor files and swallows read errors,
// so select the narrower project-only set here and pass it through agentsFilesOverride.
const NAMES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function projectGuidance(cwd: string, snapshotRoot?: string): Promise<{ path: string; content: string }[]> {
  const start = await realpath(cwd);
  let root = snapshotRoot ? await realpath(snapshotRoot) : start;
  if (snapshotRoot) {
    const relative = path.relative(root, start);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Guidance cwd is outside snapshot");
  } else {
    for (let dir = start; ; dir = path.dirname(dir)) {
      if (await exists(path.join(dir, ".git"))) { root = dir; break; }
      if (path.dirname(dir) === dir) break;
    }
  }
  const dirs = [start];
  while (dirs[0] !== root) dirs.unshift(path.dirname(dirs[0]!));
  const files: { path: string; content: string }[] = [];
  let bytes = 0;
  for (const dir of dirs) {
    for (const name of NAMES) {
      const file = path.join(dir, name);
      if (!await exists(file)) continue;
      const target = await realpath(file);
      const relative = path.relative(root, target);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Project guidance points outside project: ${file}`);
      }
      const info = await stat(target);
      if (!info.isFile()) continue;
      if (bytes + info.size > 32_000) throw new Error(`Project guidance exceeds 32,000 UTF-8 bytes: ${file}. Narrow the guidance or explicitly opt out with repoInstructions:false.`);
      const content = (await readFile(target, "utf8")).replace(/^\uFEFF/, "");
      bytes += Buffer.byteLength(content);
      if (bytes > 32_000) throw new Error(`Project guidance exceeds 32,000 UTF-8 bytes: ${file}`);
      files.push({ path: file, content });
      break;
    }
  }
  return files;
}
