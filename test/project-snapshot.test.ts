import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";
import { snapshotProject } from "../src/runtime/project-snapshot.js";

const exec = promisify(execFile);
let directory: string;
let repo: string;
async function git(...args: string[]) {
  return exec("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args]);
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "scope-snapshot-"));
  repo = path.join(directory, "repo");
  await mkdir(repo);
  await git("init", "-q");
  await mkdir(path.join(repo, "nested"));
  await writeFile(path.join(repo, "nested", "evidence.txt"), "committed evidence\n");
  await writeFile(path.join(repo, ".gitignore"), "secret.txt\n");
  await git("add", ".");
  await git("commit", "-qm", "fixture");
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

it("exports exact committed bytes and nested cwd, without ignored files or Git administration", async () => {
  await writeFile(path.join(repo, "secret.txt"), "synthetic ignored secret");
  const output = path.join(directory, "snapshot");
  const result = await snapshotProject(path.join(repo, "nested"), output, new AbortController().signal);
  expect(result.cwd).toBe("/workspace/nested");
  expect(result.commit).toBe((await git("rev-parse", "HEAD")).stdout.trim());
  expect(result.files).toBe(2);
  expect(await readFile(path.join(output, "nested/evidence.txt"), "utf8")).toBe("committed evidence\n");
  await expect(readFile(path.join(output, "secret.txt"))).rejects.toThrow();
  await expect(readFile(path.join(output, ".git/HEAD"))).rejects.toThrow();
});

it.each(["tracked", "untracked", "deleted"])("refuses %s changes rather than silently dropping work", async (kind) => {
  if (kind === "deleted") await rm(path.join(repo, "nested/evidence.txt"));
  else await writeFile(path.join(repo, kind === "tracked" ? "nested/evidence.txt" : "new-file.txt"), "new work");
  await expect(snapshotProject(repo, path.join(directory, "snapshot"), new AbortController().signal)).rejects.toThrow(/clean committed/);
});

it("preserves an empty nested starting directory in the copy", async () => {
  const cwd = path.join(repo, "empty");
  await mkdir(cwd);
  const destination = path.join(directory, "snapshot");
  const snapshot = await snapshotProject(cwd, destination, new AbortController().signal);
  expect(snapshot.cwd).toBe("/workspace/empty");
  await writeFile(path.join(destination, "empty", "usable"), "yes");
});

it("never executes configured clean filters while checking committed input", async () => {
  await writeFile(path.join(repo, ".gitattributes"), "nested/evidence.txt filter=fixture\n");
  await git("add", ".gitattributes");
  await git("commit", "-qm", "attributes");
  const marker = path.join(directory, "filter-ran");
  await git("config", "filter.fixture.clean", `printf executed > '${marker}'; cat`);
  await writeFile(path.join(repo, "nested/evidence.txt"), "committed evidence\n");
  await snapshotProject(repo, path.join(directory, "snapshot"), new AbortController().signal);
  await expect(readFile(marker)).rejects.toThrow();
});

it("rejects committed symlinks without reading their target", async () => {
  await symlink(path.join(directory, "outside-canary"), path.join(repo, "link"));
  await git("add", "link");
  await git("commit", "-qm", "link");
  await expect(snapshotProject(repo, path.join(directory, "snapshot"), new AbortController().signal)).rejects.toThrow(/symlink|regular/);
});

it("rejects oversized input and pre-aborted work before materializing a copy", async () => {
  await writeFile(path.join(repo, "large"), Buffer.alloc(12 * 1024 * 1024 + 1));
  await git("add", "large");
  await git("commit", "-qm", "large");
  await expect(snapshotProject(repo, path.join(directory, "snapshot"), new AbortController().signal)).rejects.toThrow(/12 MiB/);
  await expect(snapshotProject(repo, path.join(directory, "aborted"), AbortSignal.abort())).rejects.toThrow();
});
