import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { BashOperations } from "@earendil-works/pi-coding-agent";

import { dockerPolicy } from "./docker-policy.js";
import type { DockerPolicy, GuestCapabilities } from "../core/types.js";

const execFileAsync = promisify(execFile);
const OUTPUT_BYTES = 1024 * 1024;

async function docker(args: string[], input?: Buffer, signal?: AbortSignal): Promise<string> {
  const pending = execFileAsync("docker", args, { timeout: 15_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024, ...(signal ? { signal } : {}) });
  pending.child.stdin?.on("error", () => {});
  pending.child.stdin?.end(input);
  return (await pending).stdout.trim();
}

/** Command execution boundary; host policy owns image, import and lifecycle. */
export class DockerRuntime implements BashOperations {
  readonly name: string;
  private disposal: Promise<void> | undefined;
  private closed = false;
  private running = false;
  private stopClient: (() => void) | undefined;

  private constructor(name = `pi-scopes-${randomUUID()}`) {
    if (!/^pi-scopes-[0-9a-f-]{36}$/.test(name)) throw new Error("Invalid owned Docker runtime identity");
    this.name = name;
  }

  static async create(image: string, onAllocated?: (name: string) => Promise<void>, signal?: AbortSignal, policy: DockerPolicy = dockerPolicy({})): Promise<DockerRuntime> {
    signal?.throwIfAborted();
    if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error("Docker image must be a complete local sha256: image ID; no pull or mutable tags.");
    // Image-declared VOLUMEs would create writable mounts outside the bounded tmpfs policy.
    const volumes: unknown = JSON.parse(await docker(["image", "inspect", "--format", "{{json .Config.Volumes}}", image]));
    if (volumes && Object.keys(volumes).length) throw new Error("Docker image declares volumes; use an image without VOLUME instructions.");
    const runtime = new DockerRuntime();
    await onAllocated?.(runtime.name); // Persist ownership before Docker can create anything.
    try {
      signal?.throwIfAborted();
      await docker([
        "create", "--pull=never", "--name", runtime.name, "--label", "pi-scopes.runtime=experimental",
        `--network=${policy.network}`, "--ipc=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
        "--user=65534:65534", `--pids-limit=${policy.pidsLimit}`, `--memory=${policy.memory}`, `--memory-swap=${policy.memory}`, `--cpus=${policy.cpus}`,
        `--tmpfs=/workspace:rw,exec,nosuid,nodev,size=${policy.workspaceSize},mode=1777`, `--tmpfs=/tmp:rw,exec,nosuid,nodev,size=${policy.tmpSize},mode=1777`,
        "--workdir=/workspace", "--env=HOME=/tmp", "--env=BASH_ENV=/dev/null", "--env=ENV=/dev/null",
        "--no-healthcheck", "--log-driver=none", "--init", "--entrypoint=/bin/sh", image,
        "-c", "while :; do sleep 3600; done",
      ]);
      signal?.throwIfAborted();
      await docker(["start", runtime.name]);
      signal?.throwIfAborted();
      return runtime;
    } catch (error) {
      try { await runtime.dispose(); }
      catch (cleanup) { throw new AggregateError([error, cleanup], `Docker startup failed; cleanup unverified for ${runtime.name}`); }
      throw error;
    }
  }

  static async recover(name: string): Promise<void> {
    const runtime = new DockerRuntime(name);
    if (!await docker(["ps", "-aq", "--filter", `name=^/${name}$`])) return;
    let label: string;
    try { label = await docker(["inspect", "--format", '{{index .Config.Labels "pi-scopes.runtime"}}', name]); }
    catch (error) {
      if (!await docker(["ps", "-aq", "--filter", `name=^/${name}$`])) return;
      throw error;
    }
    if (label !== "experimental") throw new Error(`Refusing cleanup of unlabelled Docker runtime: ${name}`);
    await runtime.dispose();
  }

  async importDirectory(directory: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.closed || this.running) throw new Error("Docker import requires an idle open runtime");
    this.running = true;
    try {
      // Docker cp refuses read-only rootfs, including tmpfs targets. Stream an owned regular-file
      // snapshot to the unprivileged guest instead; never weaken rootfs or add CHOWN capability.
      // Do not archive '.' itself: it is a root-owned tmpfs mount in the guest.
      const entries = (await readdir(directory)).map((name) => `./${name}`);
      const archive = await execFileAsync("tar", ["--format=ustar", "-cf", "-", "-C", directory, ...(entries.length ? ["--", ...entries] : ["--files-from=/dev/null"])], {
        encoding: "buffer", maxBuffer: 16 * 1024 * 1024, timeout: 15_000, killSignal: "SIGKILL", ...(signal ? { signal } : {}),
        env: { ...process.env, TAR_OPTIONS: "", COPYFILE_DISABLE: "1" },
      });
      signal?.throwIfAborted();
      if (this.closed) throw new Error(`Docker runtime disposed during import: ${this.name}`);
      await docker(["exec", "-i", "--workdir=/workspace", this.name, "tar", "-xf", "-", "--no-same-owner", "--no-same-permissions", "--no-overwrite-dir"], archive.stdout, signal);
      signal?.throwIfAborted();
    } finally { this.running = false; }
  }

  async capabilities(policy: DockerPolicy, signal: AbortSignal): Promise<GuestCapabilities> {
    let output = "";
    await this.exec("for tool in bash git rg jq node npm python3 pip3 uv make gcc curl tar; do if command -v \"$tool\" >/dev/null 2>&1; then printf '%s\\n' \"$tool\"; fi; done", "/workspace", { signal, timeout: 10, onData: (data) => { output += data.toString(); } });
    const expected = ["bash", "git", "rg", "jq", "node", "npm", "python3", "pip3", "uv", "make", "gcc", "curl", "tar"];
    const available = new Set(output.trim().split("\n"));
    const tools = Object.fromEntries(expected.filter((name) => available.has(name)).map((name) => [name, "on PATH"]));
    const missing = expected.filter((name) => !available.has(name));
    return { tools, missing, network: policy.network,
      summary: `Guest tools on PATH: ${Object.keys(tools).join(", ")}. Missing: ${missing.join(", ") || "none"}. Network: ${policy.network}. Memory ${policy.memory}, CPUs ${policy.cpus}, workspace ${policy.workspaceSize}, tmp ${policy.tmpSize}. Root read-only; workspace/tmp writable, HOME=/tmp. Use project-local installs or /tmp virtual environments/caches. Tool presence does not verify project dependencies, versions or authentication. Parent extensions are not inherited.${policy.warning ? " " + policy.warning : ""}` };
  }

  async listWorkspace(signal?: AbortSignal): Promise<string[]> {
    if (this.closed || this.running) throw new Error("Docker listing requires an idle open runtime");
    this.running = true;
    try {
      const result = await execFileAsync("docker", ["exec", "--workdir=/workspace", this.name, "/usr/bin/env", "-i", "PATH=/usr/bin:/bin", "find", ".", "-mindepth", "1", "!", "-type", "d", "-printf", "%P\\0"], {
        encoding: "buffer", maxBuffer: 8 * 1024 * 1024, timeout: 15_000, killSignal: "SIGKILL", ...(signal ? { signal } : {}),
      });
      const bytes = result.stdout;
      if (!Buffer.from(bytes.toString("utf8")).equals(bytes) || (bytes.length && bytes.at(-1) !== 0)) throw new Error("Invalid/incomplete guest path listing");
      const paths = bytes.length ? bytes.toString().slice(0, -1).split("\0") : [];
      if (paths.length > 100_000 || new Set(paths).size !== paths.length || paths.some((p) => !p || p.startsWith("/") || p.split("/").some((s) => !s || s === "." || s === ".." || s.toLowerCase() === ".git"))) throw new Error("Unsafe or oversized guest path listing");
      return paths;
    } finally { this.running = false; }
  }

  async exportWorkspace(signal?: AbortSignal, paths?: string[]): Promise<Buffer> {
    signal?.throwIfAborted();
    if (this.closed || this.running) throw new Error("Docker export requires an idle open runtime");
    this.running = true;
    try {
      signal?.throwIfAborted();
      const pending = execFileAsync("docker", ["exec", "-i", "--workdir=/workspace", this.name, "/usr/bin/env", "-i", "PATH=/usr/bin:/bin", "tar", "--format=ustar", "-cf", "-", "-C", "/workspace", ...(paths ? ["--null", "--verbatim-files-from", "--no-recursion", "-T", "-"] : ["."])], {
        encoding: "buffer",
        maxBuffer: 20 * 1024 * 1024,
        timeout: 15_000,
        killSignal: "SIGKILL",
        ...(signal ? { signal } : {}),
      });
      pending.child.stdin?.on("error", () => {});
      pending.child.stdin?.end(paths ? paths.join("\0") + (paths.length ? "\0" : "") : undefined);
      const result = await pending;
      signal?.throwIfAborted();
      return result.stdout;
    } finally {
      this.running = false;
    }
  }

  async exec(command: string, cwd: string, options: Parameters<BashOperations["exec"]>[2]): Promise<{ exitCode: number | null }> {
    if (this.closed) throw new Error(`Docker runtime disposed or cleanup pending: ${this.name}`);
    if (this.running) throw new Error("One command at a time per Docker runtime");
    if (cwd !== "/workspace" && (!cwd.startsWith("/workspace/") || path.posix.normalize(cwd) !== cwd)) throw new Error("Docker runner cwd must be under /workspace; host paths are not mapped.");
    const seconds = options.timeout ?? 300;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new Error("Docker command timeout must be > 0 and <= 300 seconds");
    if (options.signal?.aborted) {
      const aborted = new Error("aborted");
      try { await this.dispose(); }
      catch (cleanup) { throw new AggregateError([aborted, cleanup], `Docker command aborted; cleanup unverified for ${this.name}`); }
      throw aborted;
    }

    // Never forward options.env: SDK shell env includes host variables. No host shell is used.
    const child = spawn("docker", ["exec", `--workdir=${cwd}`, this.name, "/bin/bash", "--noprofile", "--norc", "-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    // spawn can reject invalid arguments synchronously; do not leave the runtime busy.
    this.running = true;
    this.stopClient = () => {
      child.stdout.destroy();
      child.stderr.destroy();
      child.kill("SIGKILL");
    };
    let bytes = 0;
    let failure: Error | undefined;
    let cleanupFailure: unknown;
    let stopping: Promise<void> | undefined;
    const stop = (error: Error) => {
      if (stopping) return;
      failure = error;
      // Killing only docker exec is insufficient: the daemon owns the guest processes.
      stopping = this.dispose().catch((error: unknown) => { cleanupFailure = error; });
    };
    const onAbort = () => stop(new Error("aborted"));
    const onData = (data: Buffer) => {
      if (failure) return;
      const available = OUTPUT_BYTES - bytes;
      const accepted = data.subarray(0, available);
      bytes += accepted.length;
      try { if (accepted.length) options.onData(accepted); }
      catch (error) { stop(error instanceof Error ? error : new Error(String(error))); }
      if (data.length > available) stop(new Error(`Docker command output exceeded ${OUTPUT_BYTES} bytes`));
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", stop);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => stop(new Error(`timeout:${seconds}`)), seconds * 1000);
    // The listener is installed before waiting, including for an already-fired cancellation.
    const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
    if (options.signal?.aborted) onAbort();
    try {
      const exitCode = await closed;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      await stopping;
      if (cleanupFailure) throw new AggregateError([failure, cleanupFailure], `Docker cleanup unverified for ${this.name}`);
      if (failure) throw failure;
      if (this.closed) {
        await this.disposal;
        throw new Error(`Docker runtime disposed while command was active: ${this.name}`);
      }
      return { exitCode };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      this.running = false;
      this.stopClient = undefined;
    }
  }

  dispose(): Promise<void> {
    this.closed = true;
    this.stopClient?.();
    return this.disposal ??= (async () => {
      let removalError: unknown;
      try { await docker(["rm", "--force", this.name]); }
      catch (error) { removalError = error; }
      // An already-absent container is fine, but an unreachable daemon is not proof of disposal.
      const remaining = await docker(["ps", "--all", "--quiet", "--filter", `name=^/${this.name}$`]);
      if (remaining) throw new Error(`Docker runtime still present after cleanup: ${this.name}`, { cause: removalError });
    })().catch((error: unknown) => {
      this.disposal = undefined; // Permit an explicit cleanup retry, never another command.
      throw new Error(`Docker cleanup unverified for ${this.name}`, { cause: error });
    });
  }
}
