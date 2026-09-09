import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { DockerRuntime } from "../src/runtime/docker.js";

const docker = promisify(execFile);
const image = process.env.PI_SCOPES_TEST_DOCKER_IMAGE;
const runtimes: DockerRuntime[] = [];
afterEach(async () => { await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose())); });

it("rejects mutable image names before invoking Docker", async () => {
  await expect(DockerRuntime.create("ubuntu:latest")).rejects.toThrow(/sha256/);
});

it("fails when Docker is unavailable rather than executing locally", async () => {
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = "/nonexistent-pi-scopes-test-path";
    await expect(DockerRuntime.create(`sha256:${"0".repeat(64)}`)).rejects.toThrow(/ENOENT/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
});

describe.skipIf(!image)("real Docker boundary (explicit local image required)", () => {
  async function start() {
    const runtime = await DockerRuntime.create(image!, undefined, undefined, { network: "none", memory: "256m", cpus: 1, pidsLimit: 64, workspaceSize: "16m", tmpSize: "16m" });
    runtimes.push(runtime);
    return runtime;
  }
  async function command(runtime: DockerRuntime, text: string) {
    let output = "";
    const result = await runtime.exec(text, "/workspace", { onData: (data) => { output += data.toString(); } });
    return { ...result, output };
  }
  async function absent(runtime: DockerRuntime) {
    const { stdout } = await docker("docker", ["ps", "-aq", "--filter", `name=^/${runtime.name}$`]);
    expect(stdout.trim()).toBe("");
  }

  it("keeps host files/env out, persists only guest work, and applies runtime restrictions", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "scope-host-canary-"));
    const canary = path.join(directory, "canary");
    await writeFile(canary, "synthetic-host-only", { mode: 0o600 });
    const old = process.env.PI_SCOPE_FAKE_SECRET;
    process.env.PI_SCOPE_FAKE_SECRET = "synthetic-env-only";
    try {
      const runtime = await start();
      const { stdout } = await docker("docker", ["inspect", runtime.name]);
      const [info] = JSON.parse(stdout);
      expect(info.Config.User).toBe("65534:65534");
      expect(info.HostConfig.NetworkMode).toBe("none");
      expect(info.HostConfig.ReadonlyRootfs).toBe(true);
      expect(info.HostConfig.Privileged).toBe(false);
      expect(info.HostConfig.CapDrop).toContain("ALL");
      expect(info.HostConfig.SecurityOpt).toContain("no-new-privileges");
      expect(info.HostConfig.PidsLimit).toBe(64);
      expect(info.HostConfig.Memory).toBe(256 * 1024 * 1024);
      expect(info.Mounts).toEqual([]);
      expect(Object.keys(info.HostConfig.Tmpfs).sort()).toEqual(["/tmp", "/workspace"]);
      const quoted = JSON.stringify(canary);
      const probe = await command(runtime, `test ! -e ${quoted} && test ! -S /var/run/docker.sock && test "$(id -u)" = 65534 && test "\${PI_SCOPE_FAKE_SECRET-unset}" = unset && ! touch /host-root-write && printf saved > /workspace/result && printf protected`);
      expect(probe.exitCode).toBe(0);
      expect(probe.output).toContain("protected");
      expect((await command(runtime, "cat /workspace/result")).output).toBe("saved");
      expect((await command(runtime, "printf '#!/bin/sh\\necho executable\\n' > /workspace/check; chmod +x /workspace/check; /workspace/check")).output).toBe("executable\n");
      expect(await command(runtime, "printf error >&2; exit 42")).toEqual({ exitCode: 42, output: "error" });
      expect((await command(runtime, "true")).exitCode).toBe(0);
      expect((await command(runtime, "dd if=/dev/zero of=/workspace/fill bs=1M count=17 2>/dev/null")).exitCode).not.toBe(0);
      expect((await command(runtime, "rm /workspace/fill")).exitCode).toBe(0);
      // Shell syntax stays in the guest; never becomes an outer host-shell command.
      await command(runtime, `printf changed > ${quoted}; printf payload-finished`);
      expect(await readFile(canary, "utf8")).toBe("synthetic-host-only");
      let envOutput = "";
      await runtime.exec("printf '%s' \"${PI_SCOPE_FAKE_SECRET-unset}\"", "/workspace", {
        env: { PI_SCOPE_FAKE_SECRET: "do-not-forward" }, onData: (data) => { envOutput += data.toString(); },
      });
      expect(envOutput).toBe("unset");
      await expect(runtime.exec("true", directory, { onData() {} })).rejects.toThrow(/workspace/);
      await runtime.dispose();
      await absent(runtime);
      await expect(command(runtime, "echo unavailable")).rejects.toThrow(/disposed/);
    } finally {
      if (old === undefined) delete process.env.PI_SCOPE_FAKE_SECRET;
      else process.env.PI_SCOPE_FAKE_SECRET = old;
      await rm(directory, { recursive: true, force: true });
    }
  }, 90_000);

  it("removes the whole runtime when a running command is cancelled, including detached work", async () => {
    const runtime = await start();
    const controller = new AbortController();
    const run = runtime.exec("nohup sleep 300 >/tmp/sleeper.log 2>&1 & echo ready; wait", "/workspace", {
      signal: controller.signal,
      onData(data) { if (data.toString().includes("ready")) controller.abort(); },
    });
    await expect(run).rejects.toThrow(/aborted/);
    await absent(runtime);
  }, 90_000);

  it("removes the runtime on command timeout rather than just killing the Docker client", async () => {
    const runtime = await start();
    await expect(runtime.exec("sleep 300", "/workspace", { timeout: 0.2, onData() {} })).rejects.toThrow(/timeout/);
    await absent(runtime);
  }, 90_000);

  it.each(["yes flood", "yes flood >&2"])("caps output and removes a flooding runtime: %s", async (text) => {
    const runtime = await start();
    let bytes = 0;
    await expect(runtime.exec(text, "/workspace", { onData(data) { bytes += data.length; } })).rejects.toThrow(/output/i);
    expect(bytes).toBeLessThanOrEqual(1024 * 1024);
    await absent(runtime);
  }, 90_000);

  it("does not poison command state after a synchronous spawn-argument error", async () => {
    const runtime = await start();
    await expect(command(runtime, "echo\u0000bad")).rejects.toThrow();
    expect((await command(runtime, "echo usable")).output).toBe("usable\n");
  }, 90_000);

  it("reports external disposal as interruption, not ordinary command completion", async () => {
    const runtime = await start();
    let cleanup: Promise<void> | undefined;
    await expect(runtime.exec("echo ready; sleep 300", "/workspace", {
      onData(data) { if (data.toString().includes("ready")) cleanup = runtime.dispose(); },
    })).rejects.toThrow(/disposed/);
    await cleanup;
    await absent(runtime);
  }, 90_000);

  it("stays closed after cleanup failure but permits an explicit disposal retry", async () => {
    const runtime = await start();
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = "/nonexistent-pi-scopes-test-path";
      await expect(runtime.dispose()).rejects.toThrow();
      await expect(command(runtime, "echo forbidden")).rejects.toThrow(/disposed/);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
    try {
      await runtime.dispose();
      await absent(runtime);
    } finally {
      // Test-owned cleanup also works against the intentionally failing implementation.
      await docker("docker", ["rm", "-f", runtime.name]).catch(() => {});
    }
  }, 90_000);

  it("rejects concurrent commands without interrupting the active command", async () => {
    const runtime = await start();
    const controller = new AbortController();
    let ready!: () => void;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    const run = runtime.exec("echo ready; sleep 300", "/workspace", {
      signal: controller.signal, onData(data) { if (data.toString().includes("ready")) ready(); },
    });
    const finished = expect(run).rejects.toThrow(/aborted/);
    await started;
    try { await expect(command(runtime, "echo second")).rejects.toThrow(/One command/); }
    finally { controller.abort(); await finished; }
    await absent(runtime);
  }, 90_000);

  it("preserves cancellation context if cleanup of a pre-aborted call fails", async () => {
    const runtime = await start();
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = "/nonexistent-pi-scopes-test-path";
      await expect(runtime.exec("echo forbidden", "/workspace", { signal: AbortSignal.abort(), onData() {} })).rejects.toThrow(/aborted.*cleanup/);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
    await runtime.dispose();
  }, 90_000);

  it("cancels host archive creation during import without waiting for its control deadline", async () => {
    const runtime = await start();
    const directory = await mkdtemp(path.join(os.tmpdir(), "scope-import-cancel-"));
    const marker = path.join(directory, "started");
    await writeFile(path.join(directory, "tar"), `#!/bin/sh\nprintf started > '${marker}'\nexec /bin/sleep 30\n`, { mode: 0o700 });
    const originalPath = process.env.PATH;
    const controller = new AbortController();
    process.env.PATH = `${directory}${path.delimiter}${originalPath ?? ""}`;
    const task = runtime.importDirectory(directory, controller.signal);
    const stopped = expect(task).rejects.toThrow();
    try {
      let started = false;
      for (let attempt = 0; attempt < 300 && !started; attempt++) {
        started = await readFile(marker).then(() => true, () => false);
        if (!started) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(started).toBe(true);
      const at = Date.now();
      controller.abort();
      await stopped;
      expect(Date.now() - at).toBeLessThan(2000);
    } finally {
      controller.abort();
      await stopped;
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      await rm(directory, { recursive: true, force: true });
    }
  }, 90_000);

  it("honors an already-aborted signal without running a command", async () => {
    const runtime = await start();
    await expect(runtime.exec("echo forbidden", "/workspace", { signal: AbortSignal.abort(), onData() { throw new Error("must not run"); } })).rejects.toThrow(/aborted/);
    await absent(runtime);
  }, 90_000);
});
