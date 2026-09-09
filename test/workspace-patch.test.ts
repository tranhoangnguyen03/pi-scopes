import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateUnifiedDiff, parseWorkspaceTar, captureWorkspacePatch } from "../src/runtime/workspace-patch.js";
import type { SnapshotFileMeta } from "../src/runtime/project-snapshot.js";
import { DockerRuntime } from "../src/runtime/docker.js";

const exec = promisify(execFile);
const image = process.env.PI_SCOPES_TEST_DOCKER_IMAGE;

describe("generateUnifiedDiff", () => {
  it("generates correct addition diff", () => {
    const { diff, additions, deletions } = generateUnifiedDiff("", "first line\nsecond line\n");
    expect(additions).toBe(2);
    expect(deletions).toBe(0);
    expect(diff).toBe("@@ -0,0 +1,2 @@\n+first line\n+second line\n");
  });

  it("generates correct deletion diff", () => {
    const { diff, additions, deletions } = generateUnifiedDiff("first line\nsecond line\n", "");
    expect(additions).toBe(0);
    expect(deletions).toBe(2);
    expect(diff).toBe("@@ -1,2 +0,0 @@\n-first line\n-second line\n");
  });

  it("generates modifications with 3 lines of context", () => {
    const oldText = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n";
    const newText = "1\n2\n3\n4\nMODIFIED\n6\n7\n8\n9\n10\n";
    const { diff, additions, deletions } = generateUnifiedDiff(oldText, newText);
    expect(additions).toBe(1);
    expect(deletions).toBe(1);
    expect(diff).toContain("@@ -2,7 +2,7 @@");
    expect(diff).toContain("-5");
    expect(diff).toContain("+MODIFIED");
  });

  it("handles missing newline at end of file", () => {
    const { diff } = generateUnifiedDiff("old content", "new content");
    expect(diff).toContain("-old content");
    expect(diff).toContain("+new content");
    expect(diff).toContain("\\ No newline at end of file");
  });

  it("captures newline-only changes without quadratic diff storage", () => {
    expect(generateUnifiedDiff("same", "same\n").diff).toContain("-same\n\\ No newline at end of file\n+same\n");
    const result = generateUnifiedDiff("old\n".repeat(100_000), "new\n".repeat(100_000));
    expect(result.additions).toBe(100_000);
    expect(result.deletions).toBe(100_000);
  });

  it("returns empty diff when texts are identical", () => {
    const { diff, additions, deletions } = generateUnifiedDiff("hello\nworld\n", "hello\nworld\n");
    expect(diff).toBe("");
    expect(additions).toBe(0);
    expect(deletions).toBe(0);
  });
});

describe("strict tar protocol", () => {
  function archive(name = "file", type = "0") {
    const bytes = Buffer.alloc(1536);
    bytes.write(name, 0); bytes.write("0000644\0", 100); bytes.write("00000000000\0", 124);
    bytes.write(type, 156); bytes.write("ustar\0", 257);
    checksum(bytes);
    return bytes;
  }
  function checksum(bytes: Buffer) {
    bytes.fill(32, 148, 156);
    const sum = bytes.subarray(0, 512).reduce((n, b) => n + b, 0);
    bytes.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  }
  it.each(["/absolute", "../escape", "a/../escape", ".git/config", "a\\b", "line\nbreak", "space name"])("rejects unsafe/unsupported path %j", (name) => {
    expect(() => parseWorkspaceTar(archive(name))).toThrow();
  });
  it("rejects bad checksums, absent end markers, duplicates and trailing records", () => {
    const good = archive();
    const bad = Buffer.from(good); bad[0] = 120;
    expect(() => parseWorkspaceTar(bad)).toThrow(/checksum/);
    expect(() => parseWorkspaceTar(good.subarray(0, 512))).toThrow(/Incomplete/);
    expect(() => parseWorkspaceTar(Buffer.concat([good.subarray(0, 512), good]))).toThrow(/Duplicate/);
    expect(() => parseWorkspaceTar(Buffer.concat([good, good]))).toThrow(/trailing/);
    expect(() => parseWorkspaceTar(archive(".git/", "5"))).toThrow(/administration/);
    expect(() => parseWorkspaceTar(archive("extended", "x"))).toThrow(/extended/);
  });
});

describe("parseWorkspaceTar", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "parse-tar-test-"));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("parses regular files and file modes from tar buffer", async () => {
    await writeFile(path.join(directory, "file1.txt"), "hello");
    await writeFile(path.join(directory, "file2.sh"), "echo hi\n", { mode: 0o755 });
    const archive = (await exec("tar", ["--format=ustar", "-cf", "-", "-C", directory, "."], { encoding: "buffer", env: { ...process.env, COPYFILE_DISABLE: "1" } })).stdout;
    const parsed = parseWorkspaceTar(archive);
    expect(parsed.get("file1.txt")?.content.toString("utf8")).toBe("hello");
    expect(parsed.get("file1.txt")?.mode).toBe("100644");
    expect(parsed.get("file2.sh")?.content.toString("utf8")).toBe("echo hi\n");
    expect(parsed.get("file2.sh")?.mode).toBe("100755");
  });

  it("rejects symlinks in tar buffer", async () => {
    await writeFile(path.join(directory, "target.txt"), "target");
    await exec("ln", ["-s", "target.txt", path.join(directory, "link.txt")]);
    const archive = (await exec("tar", ["--format=ustar", "-cf", "-", "-C", directory, "."], { encoding: "buffer", env: { ...process.env, COPYFILE_DISABLE: "1" } })).stdout;
    expect(() => parseWorkspaceTar(archive)).toThrow(/symlinks and special files/);
  });

  it("rejects .git components in paths", async () => {
    await mkdir(path.join(directory, ".git"));
    await writeFile(path.join(directory, ".git", "config"), "test");
    const archive = (await exec("tar", ["--format=ustar", "-cf", "-", "-C", directory, "."], { encoding: "buffer", env: { ...process.env, COPYFILE_DISABLE: "1" } })).stdout;
    expect(() => parseWorkspaceTar(archive)).toThrow(/\.git administration/);
  });

  it("rejects oversized file byte totals", async () => {
    await writeFile(path.join(directory, "file.txt"), "a".repeat(100));
    const archive = (await exec("tar", ["--format=ustar", "-cf", "-", "-C", directory, "."], { encoding: "buffer", env: { ...process.env, COPYFILE_DISABLE: "1" } })).stdout;
    expect(() => parseWorkspaceTar(archive, { maxBytes: 50 })).toThrow(/limit exceeded/);
  });

  it("rejects oversized file counts", async () => {
    await writeFile(path.join(directory, "file1.txt"), "1");
    await writeFile(path.join(directory, "file2.txt"), "2");
    const archive = (await exec("tar", ["--format=ustar", "-cf", "-", "-C", directory, "."], { encoding: "buffer", env: { ...process.env, COPYFILE_DISABLE: "1" } })).stdout;
    expect(() => parseWorkspaceTar(archive, { maxFiles: 1 })).toThrow(/limit exceeded/);
  });

  it("rejects truncated tar buffers", async () => {
    await writeFile(path.join(directory, "file.txt"), "some content");
    const archive = (await exec("tar", ["--format=ustar", "-cf", "-", "-C", directory, "."], { encoding: "buffer", env: { ...process.env, COPYFILE_DISABLE: "1" } })).stdout;
    const truncated = archive.subarray(0, 600); // cuts off in middle of block
    expect(() => parseWorkspaceTar(truncated)).toThrow(/Incomplete tar stream/);
  });
});

describe("captureWorkspacePatch binary & ignore handling", () => {
  let repo: string;
  let inputDir: string;
  beforeEach(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "patch-binary-test-"));
    repo = path.join(dir, "repo");
    inputDir = path.join(dir, "input");
    await mkdir(repo);
    await mkdir(inputDir);
    await exec("git", ["-C", repo, "init", "-q"]);
    await exec("git", ["-C", repo, "config", "user.name", "Fixture"]);
    await exec("git", ["-C", repo, "config", "user.email", "fixture@example.invalid"]);
    await writeFile(path.join(repo, ".gitignore"), "__pycache__/\n*.bin\n");
    await exec("git", ["-C", repo, "add", "."]);
    await exec("git", ["-C", repo, "commit", "-qm", "init"]);
  });
  afterEach(async () => {
    await rm(path.dirname(repo), { recursive: true, force: true });
  });

  it("rejects binary changes on tracked files with an explicit error", async () => {
    await writeFile(path.join(inputDir, "tracked.txt"), "text content\n");
    const manifest = new Map<string, SnapshotFileMeta>([
      ["tracked.txt", { mode: "100644", bytes: 13 }],
    ]);
    const mockRuntime = {
      listWorkspace: async () => ["tracked.txt"],
      exportWorkspace: async () => {
        const guestDir = await mkdtemp(path.join(os.tmpdir(), "mock-guest-"));
        try {
          await writeFile(path.join(guestDir, "tracked.txt"), Buffer.from([0x61, 0x00, 0x62]));
          return (await exec("tar", ["--format=ustar", "-cf", "-", "-C", guestDir, "."], { encoding: "buffer", env: { ...process.env, COPYFILE_DISABLE: "1" } })).stdout;
        } finally {
          await rm(guestDir, { recursive: true, force: true });
        }
      },
    } as unknown as DockerRuntime;

    await expect(captureWorkspacePatch({
      runtime: mockRuntime,
      repoRoot: repo,
      inputDir,
      sourceRevision: "abc1234",
      manifest,
    })).rejects.toThrow(/Binary file changes are not supported: tracked\.txt/);
  });

  it("filters out untracked ignored cache files (__pycache__) without failing", async () => {
    await writeFile(path.join(inputDir, "app.py"), "print('hello')\n");
    const manifest = new Map<string, SnapshotFileMeta>([
      ["app.py", { mode: "100644", bytes: 15 }],
    ]);
    const mockRuntime = {
      listWorkspace: async () => ["app.py", "__pycache__/app.pyc"],
      exportWorkspace: async (_signal: AbortSignal, selected: string[]) => {
        expect(selected).toEqual(["app.py"]);
        const guestDir = await mkdtemp(path.join(os.tmpdir(), "mock-guest-"));
        try {
          await writeFile(path.join(guestDir, "app.py"), "print('hello')\n");
          await mkdir(path.join(guestDir, "__pycache__"));
          await writeFile(path.join(guestDir, "__pycache__", "app.pyc"), Buffer.from([0x00, 0x01, 0x02]));
          return (await exec("tar", ["--format=ustar", "-cf", "-", "-C", guestDir, ...selected], { encoding: "buffer", env: { ...process.env, COPYFILE_DISABLE: "1" } })).stdout;
        } finally {
          await rm(guestDir, { recursive: true, force: true });
        }
      },
    } as unknown as DockerRuntime;

    const result = await captureWorkspacePatch({
      runtime: mockRuntime,
      repoRoot: repo,
      inputDir,
      sourceRevision: "abc1234",
      manifest,
    });
    expect(result.status).toBe("no-change");
  });
});
