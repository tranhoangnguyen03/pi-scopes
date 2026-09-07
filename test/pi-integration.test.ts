import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AgentSession, createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import piScopes from "../src/index.js";
import { PiChildExecutor } from "../src/child/pi-child-executor.js";
import { ScopeKernel } from "../src/core/scope-kernel.js";
import { ScopeStore } from "../src/storage/scope-store.js";
import { readEvidence } from "../src/trace/evidence.js";
import { ChildTraceRecorder } from "../src/trace/child-trace-recorder.js";
import { DockerRuntime } from "../src/runtime/docker.js";

interface RequestBody {
  model: string;
  tools: { function: { name: string } }[];
  messages: { role: string; content: unknown }[];
}

let directory: string;
let server: Server;
let runtime: ModelRuntime;
let mode: "return" | "wait" | "partial" | "budget" | "ignore-return" | "partial-return" | "repair-return" | "wait-return" | "retrieve";
let returnRequested: Promise<void>;
let onReturnRequested: () => void;
let requests: RequestBody[];
let requested: Promise<void>;
let onRequested: () => void;
let parentSession: AgentSession | undefined;
let contextMode: "fresh" | "fork" | undefined;
let dockerCommand: string | undefined;
let secondDockerCommand: string | undefined;
const dockerImage = process.env.PI_SCOPES_TEST_DOCKER_IMAGE;
const exec = promisify(execFile);

const findings = {
  summary: "Located the evidence", evidence: [{ summary: "fixture evidence", source: "evidence.txt:1" }],
  artifacts: [{ label: "Source file", ref: "evidence.txt" }], decisions: ["Keep the API"], confidence: 0.9,
};

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "pi-scopes-integration-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", directory);
  vi.stubEnv("PI_OFFLINE", "1");
  vi.stubEnv("PI_SCOPES_EXECUTION", "host");
  mode = "return";
  contextMode = undefined;
  dockerCommand = undefined;
  secondDockerCommand = undefined;
  requests = [];
  requested = new Promise<void>((resolve) => { onRequested = resolve; });
  returnRequested = new Promise<void>((resolve) => { onReturnRequested = resolve; });
  // Only the provider is scripted. Sessions, tools, extension, traces and files are real.
  server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body) as RequestBody;
    requests.push(input);
    onRequested();
    const child = input.tools.some((tool) => tool.function.name === "scope_return");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.flushHeaders();
    if (child && mode === "wait") return;
    const hasResult = input.messages.some((message) => message.role === "tool");
    const returnOnly = child && input.tools.length === 1;
    if (returnOnly) onReturnRequested();
    if (returnOnly && mode === "wait-return") return;
    const investigate = child && ((["budget", "repair-return", "wait-return"].includes(mode) && !returnOnly) || mode === "ignore-return");
    const name = child ? (investigate ? "read" : hasResult ? "scope_return" : dockerCommand ? "bash" : "read") : "scope";
    let args: Record<string, unknown> = child
      ? (name === "scope_return" ? { outcome: mode === "partial-return" || returnOnly ? "partial" : "complete", ...findings } : name === "bash" ? { command: dockerCommand } : { path: "evidence.txt" })
      : { action: "run", ...(contextMode ? { context: contextMode } : {}), goal: "Investigate evidence.txt", timeoutSeconds: 5 };
    if (returnOnly && mode === "repair-return" && requests.filter((request) => request.tools.length === 1).length === 1) {
      Object.assign(args, { summary: "" });
    }
    const finalText = child && mode === "partial" ? "Recoverable investigation" : "Parent finished";
    let finish = child ? mode === "partial" : hasResult;
    if (!child && mode === "retrieve") {
      const toolMessages = input.messages.filter((message) => message.role === "tool");
      const scopeId = JSON.stringify(toolMessages).match(/sc_[a-z0-9]+/)?.[0];
      if (toolMessages.length === 1) args = { action: "inspect", scopeId };
      if (toolMessages.length === 2) args = { action: "read", scopeId, item: 1 };
      finish = toolMessages.length >= 3;
    }
    const delta = finish ? { role: "assistant", content: finalText } : {
      role: "assistant", tool_calls: [{ index: 0, id: `call_${requests.length}`, type: "function",
        function: { name, arguments: JSON.stringify(args) } }],
    };
    if (!finish && child && name === "bash" && secondDockerCommand && "tool_calls" in delta) {
      delta.tool_calls.push({ index: 1, id: `call_${requests.length}_second`, type: "function",
        function: { name: "bash", arguments: JSON.stringify({ command: secondDockerCommand }) } });
    }
    res.end(`data: ${JSON.stringify({
      id: `completion_${requests.length}`, object: "chat.completion.chunk", created: 1, model: "fixture",
      choices: [{ index: 0, delta, finish_reason: finish ? "stop" : "tool_calls" }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture server address");
  await writeFile(path.join(directory, "models.json"), JSON.stringify({ providers: { fixture: {
    baseUrl: `http://127.0.0.1:${address.port}/v1`, api: "openai-completions", apiKey: "test-only",
    models: [{ id: "fixture", contextWindow: 128_000, maxTokens: 4_096,
      cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } }],
  } } }));
  await writeFile(path.join(directory, "evidence.txt"), "fixture evidence\n");
  runtime = await ModelRuntime.create({
    authPath: path.join(directory, "auth.json"), modelsPath: path.join(directory, "models.json"), refreshOnCreate: false,
  });
});

afterEach(async () => {
  await parentSession?.abort();
  parentSession?.dispose();
  parentSession = undefined;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

async function createKernel(cwd = directory): Promise<ScopeKernel> {
  const store = new ScopeStore(path.join(directory, "scope-data"), "integration");
  const kernel = new ScopeKernel(store, new PiChildExecutor(store), cwd);
  await kernel.initialize();
  return kernel;
}

function parent() {
  const model = runtime.getModel("fixture", "fixture");
  if (!model) throw new Error("Missing fixture model");
  return { model, thinkingLevel: "off" as const };
}

async function committedWorkspace() {
  const cwd = path.join(directory, "workspace");
  await mkdir(cwd);
  await writeFile(path.join(cwd, "evidence.txt"), "fixture evidence\n");
  await writeFile(path.join(cwd, "AGENTS.md"), "SNAPSHOT_GUIDANCE");
  for (const args of [["init", "-q"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]]) {
    await exec("git", ["-C", cwd, ...args]);
  }
  vi.stubEnv("PI_SCOPES_EXECUTION", "docker");
  vi.stubEnv("PI_SCOPES_DOCKER_IMAGE", dockerImage!);
  return cwd;
}

describe.skipIf(!dockerImage)("isolated delegation through real Pi and Docker", () => {
  it.each(["fresh", "fork"] as const)("runs %s against a copy and retains output after cleanup", async (context) => {
    const cwd = await committedWorkspace();
    mode = "retrieve";
    contextMode = context;
    dockerCommand = "cat evidence.txt; printf changed > evidence.txt; head -c 12000 /dev/zero | tr '\\0' x; printf RETAINED_DOCKER_TAIL";
    const settingsManager = SettingsManager.inMemory();
    const loader = new DefaultResourceLoader({ cwd, agentDir: directory, settingsManager, noExtensions: true, noSkills: true,
      noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [piScopes] });
    await loader.reload();
    ({ session: parentSession } = await createAgentSession({ cwd, agentDir: directory, ...parent(), modelRuntime: runtime,
      tools: ["scope"], resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(cwd) }));
    await parentSession.prompt("PARENT_DOCKER_BACKGROUND: investigate in the selected environment.");
    const children = requests.filter((request) => request.tools.some((tool) => tool.function.name === "scope_return"));
    expect(children[0]?.tools.map((tool) => tool.function.name).sort()).toEqual(["bash", "scope_return"]);
    expect(JSON.stringify(children)).toContain("/workspace");
    expect(JSON.stringify(children).includes("PARENT_DOCKER_BACKGROUND")).toBe(context === "fork");
    expect(JSON.stringify(children).includes("SNAPSHOT_GUIDANCE")).toBe(context === "fresh");
    if (context === "fresh") expect(JSON.stringify(children[0]?.messages)).toContain('/workspace/AGENTS.md');
    expect(await readFile(path.join(cwd, "evidence.txt"), "utf8")).toBe("fixture evidence\n");
    const store = new ScopeStore(path.join(directory, "scope-data"), parentSession.sessionId);
    const scope = (await store.listScopes()).find((record) => record.kind === "subsession")!;
    expect(scope).toMatchObject({ workspaceMode: "docker-copy", status: "completed", runtime: { state: "disposed" } });
    expect(await store.readResult(scope.id)).toMatchObject({ workspaceMode: "docker-copy", usage: { input: 20, output: 8 } });
    const events = await store.readTrace(scope.id);
    const output = events.find((event) => event.type === "pi.tool_execution_end" && (event.data as any).toolName === "bash")!.data as any;
    expect(await store.readEvidenceBlob(scope.id, output.result.details.blobRef)).toContain("RETAINED_DOCKER_TAIL");
    const beforeRetrieval = requests.filter((request) => request.tools.some((tool) => tool.function.name === "scope"))[1];
    expect(JSON.stringify(beforeRetrieval?.messages)).not.toContain("RETAINED_DOCKER_TAIL");
    expect(JSON.stringify(requests.at(-1)?.messages)).toContain("Recorded output:");
    await expect(access(store.scratchPath(scope.id))).rejects.toThrow();
  }, 90_000);

  it("serializes Bash calls from one model response and retains both outputs", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "sleep 0.2; printf FIRST > evidence.txt; cat evidence.txt";
    secondDockerCommand = "cat evidence.txt; printf SECOND";
    const kernel = await createKernel(cwd);
    const capsule = await kernel.fork({ goal: "Run both commands", parent: parent() });
    expect(capsule.status).toBe("completed");
    expect(capsule.error).toBeUndefined();
    const events = (await kernel.store.readTrace(capsule.scopeId)).filter((event) =>
      event.type === "pi.tool_execution_end" && (event.data as any).toolName === "bash");
    expect(events).toHaveLength(2);
    const outputs = [];
    for (const event of events) {
      const { details } = (event.data as any).result;
      expect(details.exitCode).toBe(0);
      expect(details.error).toBeUndefined();
      outputs.push(await kernel.store.readEvidenceBlob(capsule.scopeId, details.blobRef));
    }
    expect(outputs).toEqual(["FIRST", "FIRSTSECOND"]);
    expect(await readFile(path.join(cwd, "evidence.txt"), "utf8")).toBe("fixture evidence\n");
    const scope = kernel.scopes.get(capsule.scopeId)!;
    expect(scope.runtime.state).toBe("disposed");
    expect((await exec("docker", ["ps", "-aq", "--filter", `name=^/${scope.runtime.containerName}$`])).stdout.trim()).toBe("");
  }, 90_000);

  it("denies host-backed tools even if the model attempts to call one", async () => {
    const cwd = await committedWorkspace();
    const kernel = await createKernel(cwd);
    const result = await kernel.fork({ goal: "Investigate", parent: parent() });
    expect(result.error).toBeUndefined();
    const messages = JSON.stringify(requests);
    expect(messages).toContain("Tool read not found");
    expect(messages).not.toContain("fixture evidence\\n");
  }, 90_000);

  it("removes an idle container when parent cancellation interrupts inference", async () => {
    const cwd = await committedWorkspace();
    mode = "wait";
    const kernel = await createKernel(cwd);
    const controller = new AbortController();
    const pending = kernel.fork({ goal: "Investigate", parent: parent(), signal: controller.signal });
    await Promise.race([requested, pending.then((result) => { throw new Error(`Child never requested inference: ${JSON.stringify(result)}`); })]);
    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ status: "cancelled", workspaceMode: "docker-copy" });
    const scope = kernel.scopes.get(result.scopeId)!;
    expect(scope.runtime.state).toBe("disposed");
    const identity = (await kernel.store.readTrace(scope.id)).find((event) => event.type === "docker.created")?.data as any;
    expect(identity?.name).toMatch(/^pi-scopes-/);
    const remaining = await exec("docker", ["ps", "-aq", "--filter", `name=^/${identity.name}$`]);
    expect(remaining.stdout.trim()).toBe("");
  }, 90_000);

  it("supports an empty nested cwd with root guidance and copy-relative paths", async () => {
    const root = await committedWorkspace();
    const cwd = path.join(root, "empty");
    await mkdir(cwd);
    dockerCommand = "pwd; cat ../evidence.txt";
    const kernel = await createKernel(cwd);
    const capsule = await kernel.fork({ goal: "Investigate", parent: parent() });
    expect(capsule.status).toBe("completed");
    expect(JSON.stringify(requests)).toContain("/workspace/empty");
    expect(JSON.stringify(requests)).toContain("SNAPSHOT_GUIDANCE");
    expect(capsule.sourceRevision).toMatch(/^[a-f0-9]{40,64}$/);
  }, 90_000);

  it("honors cancellation after recording identity but before container creation", async () => {
    const cwd = await committedWorkspace();
    const kernel = await createKernel(cwd);
    const controller = new AbortController();
    const original = kernel.store.saveScope.bind(kernel.store);
    vi.spyOn(kernel.store, "saveScope").mockImplementation(async (scope) => {
      await original(scope);
      if (scope.runtime.containerName) controller.abort();
    });
    const capsule = await kernel.fork({ goal: "Investigate", parent: parent(), signal: controller.signal });
    expect(capsule.status).toBe("cancelled");
    expect(requests).toHaveLength(0);
    const scope = kernel.scopes.get(capsule.scopeId)!;
    expect(scope.runtime.state).toBe("disposed");
    expect((await exec("docker", ["ps", "-aq", "--filter", `name=^/${scope.runtime.containerName}$`])).stdout.trim()).toBe("");
  }, 90_000);

  it("retains failed-command output and reports the command exit code", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "printf FAILURE_EVIDENCE; exit 42";
    const kernel = await createKernel(cwd);
    const capsule = await kernel.fork({ goal: "Inspect failure", parent: parent() });
    const event = (await kernel.store.readTrace(capsule.scopeId)).find((event) => event.type === "pi.tool_execution_end" && (event.data as any).toolName === "bash")!.data as any;
    expect(event.result.details.exitCode).toBe(42);
    expect(await kernel.store.readEvidenceBlob(capsule.scopeId, event.result.details.blobRef)).toBe("FAILURE_EVIDENCE");
  }, 90_000);

  it("propagates cancellation from the parent while a guest command is running", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "echo ready; sleep 300";
    const kernel = await createKernel(cwd);
    const controller = new AbortController();
    const capsule = await kernel.fork({ goal: "Investigate", parent: parent(), signal: controller.signal,
      onActivity: (_scope, label) => { if (label === "tool_execution_update") controller.abort(); } });
    expect(capsule.status).toBe("cancelled");
    const record = kernel.scopes.get(capsule.scopeId)!;
    expect(record.runtime.state).toBe("disposed");
    expect((await exec("docker", ["ps", "-aq", "--filter", `name=^/${record.runtime.containerName}$`])).stdout.trim()).toBe("");
  }, 90_000);

  it("preserves cleanup failure, blocks new work, and reconciles on reopen", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "echo finished";
    const kernel = await createKernel(cwd);
    const disposal = vi.spyOn(DockerRuntime.prototype, "dispose").mockRejectedValue(new Error("fixture daemon unavailable"));
    let name: string | undefined;
    try {
      const capsule = await kernel.fork({ goal: "Investigate", parent: parent() });
      name = kernel.scopes.get(capsule.scopeId)!.runtime.containerName;
      expect(capsule.status).toBe("failed");
      expect(kernel.scopes.get(capsule.scopeId)!.runtime.state).toBe("cleanup-failed");
      expect((await kernel.store.readTrace(capsule.scopeId)).some((event) => event.type === "runtime.disposed")).toBe(false);
      await expect(kernel.fork({ goal: "Do not launch", parent: parent() })).rejects.toThrow(/cleanup is unverified/);
      disposal.mockRestore();
      const reopened = await createKernel(cwd);
      expect(reopened.scopes.get(capsule.scopeId)!.runtime.state).toBe("disposed");
      expect((await exec("docker", ["ps", "-aq", "--filter", `name=^/${name}$`])).stdout.trim()).toBe("");
    } finally {
      disposal.mockRestore();
      if (name) await DockerRuntime.recover(name);
    }
  }, 90_000);

  it("refuses dirty input before child inference and never falls back to the host", async () => {
    const cwd = await committedWorkspace();
    await writeFile(path.join(cwd, "evidence.txt"), "uncommitted change");
    const kernel = await createKernel(cwd);
    const result = await kernel.fork({ goal: "Investigate", parent: parent() });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("clean committed");
    expect(requests).toHaveLength(0);
  }, 90_000);

  async function verifyPatchInDocker(cwd: string, patchText: string): Promise<void> {
    const archive = (await exec("tar", ["--exclude=.git", "-cf", "-", "-C", cwd, "."], {
      encoding: "buffer",
      env: { ...process.env, TAR_OPTIONS: "", COPYFILE_DISABLE: "1" },
    })).stdout;
    const patchB64 = Buffer.from(patchText).toString("base64");
    await new Promise<void>((resolve, reject) => {
      const child = execFile("docker", [
        "run", "--rm", "-i", "--network=none", dockerImage!,
        "sh", "-c",
        `set -e
mkdir /repo && cd /repo
tar -xf - --no-same-owner --no-same-permissions --no-overwrite-dir
git init -q
git config user.name Fixture
git config user.email fixture@example.invalid
git add .
git commit -qm init
printf "%s" "${patchB64}" | base64 -d > /tmp/change.patch
git apply --check /tmp/change.patch
git apply /tmp/change.patch
test "$(cat evidence.txt)" = 'modified content'
test -x evidence.txt
test "$(cat added.txt)" = 'brand new'
test -f empty.txt && test ! -s empty.txt
test ! -e AGENTS.md
`,
      ], (err) => err ? reject(err) : resolve());
      child.stdin?.end(archive);
    });
  }

  it("captures complete workspace patch for added, edited, deleted files and mode changes", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "printf 'brand new\\n' > added.txt; printf 'modified content\\n' > evidence.txt; rm AGENTS.md; chmod 755 evidence.txt; touch empty.txt";
    const kernel = await createKernel(cwd);
    const capsule = await kernel.fork({ goal: "Make workspace changes", parent: parent() });
    expect(capsule.status).toBe("completed");
    expect(capsule.sourceRevision).toBeDefined();
    expect(capsule.patch).toMatchObject({
      status: "captured",
      sourceRevision: capsule.sourceRevision,
    });
    expect(capsule.patch?.blobRef).toMatch(/^blob:\/\//);
    const patchText = await kernel.store.readEvidenceBlob(capsule.scopeId, capsule.patch!.blobRef!);
    expect(patchText).toBeDefined();
    expect(patchText).toContain("diff --git a/added.txt b/added.txt");
    expect(patchText).toContain("new file mode 100644");
    expect(patchText).toContain("+brand new");
    expect(patchText).toContain("diff --git a/evidence.txt b/evidence.txt");
    expect(patchText).toContain("old mode 100644");
    expect(patchText).toContain("new mode 100755");
    expect(patchText).toContain("+modified content");
    expect(patchText).toContain("diff --git a/AGENTS.md b/AGENTS.md");
    expect(patchText).toContain("deleted file mode 100644");
    await verifyPatchInDocker(cwd, patchText!);
    expect(await readFile(path.join(cwd, "evidence.txt"), "utf8")).toBe("fixture evidence\n");
    expect(await readFile(path.join(cwd, "AGENTS.md"), "utf8")).toBe("SNAPSHOT_GUIDANCE");
    const scope = kernel.scopes.get(capsule.scopeId)!;
    expect(scope.runtime.state).toBe("disposed");
    expect((await exec("docker", ["ps", "-aq", "--filter", `name=^/${scope.runtime.containerName}$`])).stdout.trim()).toBe("");
  }, 90_000);

  it("fails explicitly when retaining the patch fails and still disposes the runtime", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "printf changed > evidence.txt";
    const kernel = await createKernel(cwd);
    const save = kernel.store.saveEvidenceBlob.bind(kernel.store);
    vi.spyOn(kernel.store, "saveEvidenceBlob").mockImplementation((scopeId, data) => {
      if (data.toString().startsWith("diff --git")) return Promise.reject(new Error("fixture storage full"));
      return save(scopeId, data);
    });
    const capsule = await kernel.fork({ goal: "Change a file", parent: parent() });
    expect(capsule.status).toBe("failed");
    expect(capsule.patch).toMatchObject({ status: "error", error: "fixture storage full" });
    expect(kernel.scopes.get(capsule.scopeId)!.runtime.state).toBe("disposed");
  }, 90_000);

  it("explicitly reports no-change when guest workspace files are not modified", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "cat evidence.txt; true";
    const kernel = await createKernel(cwd);
    const capsule = await kernel.fork({ goal: "Read only", parent: parent() });
    expect(capsule.status).toBe("completed");
    expect(capsule.patch).toMatchObject({
      status: "no-change",
      sourceRevision: capsule.sourceRevision,
    });
    expect(capsule.patch?.blobRef).toBeUndefined();
    const scope = kernel.scopes.get(capsule.scopeId)!;
    expect(scope.runtime.state).toBe("disposed");
    expect((await exec("docker", ["ps", "-aq", "--filter", `name=^/${scope.runtime.containerName}$`])).stdout.trim()).toBe("");
  }, 90_000);

  it("permits durable read and inspect of the captured patch after container cleanup", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "printf 'added for read\\n' > durable.txt";
    const kernel = await createKernel(cwd);
    const capsule = await kernel.fork({ goal: "Add durable file", parent: parent() });
    expect(capsule.status).toBe("completed");
    expect(capsule.patch?.status).toBe("captured");
    const scope = kernel.scopes.get(capsule.scopeId)!;
    expect(scope.runtime.state).toBe("disposed");
    expect((await exec("docker", ["ps", "-aq", "--filter", `name=^/${scope.runtime.containerName}$`])).stdout.trim()).toBe("");

    const inspectText = await readEvidence(kernel.store, capsule.scopeId);
    expect(inspectText).toContain("workspace.patch");
    const match = inspectText.match(/(\d+)\.\s+workspace\.patch/);
    expect(match).not.toBeNull();
    const itemNum = Number(match![1]);

    const itemText = await readEvidence(kernel.store, capsule.scopeId, itemNum);
    expect(itemText).toContain("durable.txt");
    expect(itemText).toContain("+added for read");
  }, 90_000);

  it("rejects unsafe guest exports including symlinks and .git, ensuring container cleanup", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "ln -s /etc/passwd evil_link";
    const kernel = await createKernel(cwd);
    const capsule = await kernel.fork({ goal: "Symlink attempt", parent: parent() });
    expect(capsule.status).toBe("failed");
    expect(capsule.patch?.status).toBe("error");
    expect(capsule.patch?.error).toMatch(/symlink|unsafe/i);
    const scope = kernel.scopes.get(capsule.scopeId)!;
    expect(scope.runtime.state).toBe("disposed");
    expect((await exec("docker", ["ps", "-aq", "--filter", `name=^/${scope.runtime.containerName}$`])).stdout.trim()).toBe("");
  }, 90_000);

  it("rejects oversized/malformed export with explicit error and verifies container cleanup", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "python3 -c \"open('large.txt', 'wb').write(b'x' * (13 * 1024 * 1024))\"";
    const kernel = await createKernel(cwd);
    const capsule = await kernel.fork({ goal: "Oversized attempt", parent: parent() });
    expect(capsule.status).toBe("failed");
    expect(capsule.patch?.status).toBe("error");
    expect(capsule.patch?.error).toMatch(/limit|oversized|bytes|binary/i);
    const scope = kernel.scopes.get(capsule.scopeId)!;
    expect(scope.runtime.state).toBe("disposed");
    expect((await exec("docker", ["ps", "-aq", "--filter", `name=^/${scope.runtime.containerName}$`])).stdout.trim()).toBe("");
  }, 90_000);

  it("rejects a patch over the retention cap rather than silently truncating it", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "head -c 5000000 /dev/zero | tr '\\0' x > added.txt";
    const kernel = await createKernel(cwd);
    const capsule = await kernel.fork({ goal: "Large patch", parent: parent() });
    expect(capsule.status).toBe("failed");
    expect(capsule.patch?.status).toBe("error");
    expect(capsule.patch?.error).toMatch(/patch limit exceeded/);
    expect(capsule.patch?.blobRef).toBeUndefined();
    expect(kernel.scopes.get(capsule.scopeId)!.runtime.state).toBe("disposed");
  }, 90_000);

  it("reports patch capture unavailable on cancellation while preserving cleanup semantics", async () => {
    const cwd = await committedWorkspace();
    dockerCommand = "echo running; sleep 300";
    const kernel = await createKernel(cwd);
    const controller = new AbortController();
    const capsule = await kernel.fork({
      goal: "Cancel me",
      parent: parent(),
      signal: controller.signal,
      onActivity: (_s, label) => { if (label === "tool_execution_update") controller.abort(); },
    });
    expect(capsule.status).toBe("cancelled");
    expect(capsule.patch?.status).toBe("unavailable");
    const evidence = await readEvidence(kernel.store, capsule.scopeId);
    const item = Number(evidence.match(/(\d+)\. workspace\.patch/)?.[1]);
    expect(item).toBeGreaterThan(0);
    expect(await readEvidence(kernel.store, capsule.scopeId, item)).toContain("Patch capture unavailable");
    const scope = kernel.scopes.get(capsule.scopeId)!;
    expect(scope.runtime.state).toBe("disposed");
    expect((await exec("docker", ["ps", "-aq", "--filter", `name=^/${scope.runtime.containerName}$`])).stdout.trim()).toBe("");
  }, 90_000);
});

describe("real Pi integration with a local scripted provider", () => {
  it("rejects invalid owner execution configuration without inference", async () => {
    const kernel = await createKernel();
    vi.stubEnv("PI_SCOPES_EXECUTION", "typo");
    await expect(kernel.fork({ goal: "Investigate", parent: parent() })).rejects.toThrow("PI_SCOPES_EXECUTION");
    vi.stubEnv("PI_SCOPES_EXECUTION", "docker");
    vi.stubEnv("PI_SCOPES_DOCKER_IMAGE", "");
    await expect(kernel.fork({ goal: "Investigate", parent: parent() })).rejects.toThrow("PI_SCOPES_DOCKER_IMAGE");
    vi.stubEnv("PI_SCOPES_DOCKER_IMAGE", "ubuntu:latest");
    await expect(kernel.fork({ goal: "Investigate", parent: parent() })).rejects.toThrow("PI_SCOPES_DOCKER_IMAGE");
    expect(requests).toHaveLength(0);
  });

  it.each(["fresh", "fork"] as const)("delivers evidence without transcript pollution or double-counting with %s context", async (context) => {
    contextMode = context;
    const history = SessionManager.inMemory(directory);
    history.appendMessage({ role: "user", content: "EARLIER_PARENT_BACKGROUND", timestamp: 1 });
    history.appendMessage({ role: "assistant", content: [{ type: "text", text: "Earlier answer" }], api: "openai-completions", provider: "fixture", model: "fixture", timestamp: 2, stopReason: "stop",
      usage: { input: 1000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1000, cost: { input: 0.001, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.001 } } });
    history.appendCompaction("Earlier discussion summary", history.getBranch()[0]!.id, 1000, undefined, false,
      { input: 100, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 100, cost: { input: 0.0001, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.0001 } });
    await writeFile(path.join(directory, "evidence.txt"), "fixture evidence\nCHILD_ONLY_RAW_DETAIL\n");
    await writeFile(path.join(directory, "AGENTS.md"), "FRESH_PROJECT_RULES");
    const settingsManager = SettingsManager.inMemory();
    const loader = new DefaultResourceLoader({
      appendSystemPrompt: ["PARENT_EFFECTIVE_RULES"],
      cwd: directory, agentDir: directory, settingsManager, noExtensions: true, noSkills: true,
      noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [piScopes],
    });
    await loader.reload();
    ({ session: parentSession } = await createAgentSession({
      cwd: directory, agentDir: directory, ...parent(), modelRuntime: runtime,
      tools: ["scope"], resourceLoader: loader, settingsManager, sessionManager: history,
    }));
    await parentSession.prompt("PARENT_ONLY_CONTEXT: delegate the evidence investigation.");
    expect(requests).toHaveLength(4); // parent → child read → child return → parent
    const childRequests = requests.filter((request) => request.tools.some((tool) => tool.function.name === "scope_return"));
    expect(JSON.stringify(childRequests).includes("PARENT_ONLY_CONTEXT")).toBe(context === "fork");
    expect(JSON.stringify(childRequests).includes("EARLIER_PARENT_BACKGROUND")).toBe(context === "fork");
    expect(JSON.stringify(childRequests).includes("FRESH_PROJECT_RULES")).toBe(context === "fresh");
    expect(JSON.stringify(childRequests[0]?.messages).match(/PARENT_EFFECTIVE_RULES/g)?.length ?? 0).toBe(context === "fork" ? 1 : 0);
    expect(JSON.stringify(childRequests[0]?.messages).match(/You are a focused child session/g)?.length).toBe(1);
    expect(JSON.stringify(requests.at(-1)?.messages)).not.toContain("CHILD_ONLY_RAW_DETAIL");
    expect(JSON.stringify(childRequests[0]?.messages.filter((message) => message.role === "assistant"))).not.toContain('"name":"scope"');
    expect(childRequests[0]?.tools.map((tool) => tool.function.name).sort()).toEqual(
      ["read", "bash", "grep", "find", "ls", "scope_return"].sort(),
    );
    const returned = JSON.stringify(requests.at(-1)?.messages.filter((message) => message.role === "tool"));
    for (const text of ["fixture evidence", "evidence.txt:1", "Source file", "Keep the API", "0.9"]) {
      expect(returned).toContain(text);
    }
    const stats = parentSession.getSessionStats();
    expect(stats.tokens).toMatchObject({ input: 1140, output: 16, total: 1156 });
    expect(stats.cost).toBeCloseTo(0.001172, 10);
    const store = new ScopeStore(path.join(directory, "scope-data"), parentSession.sessionId);
    const scope = (await store.listScopes()).find((record) => record.kind === "subsession");
    expect(scope).toMatchObject({ status: "completed", context, runtime: { state: "disposed" } });
    expect(await store.readResult(scope!.id)).toMatchObject({ ...findings, context, usage: { input: 20, output: 8, totalTokens: 28 } });
    await expect(access(store.scratchPath(scope!.id))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await store.readTrace(scope!.id)).some((event) => event.type === "pi.tool_execution_end")).toBe(true);
  });

  it("defaults /scope to the list and explains invalid list pages", async () => {
    const loader = new DefaultResourceLoader({
      cwd: directory, agentDir: directory, settingsManager: SettingsManager.inMemory(), noExtensions: true,
      noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [piScopes],
    });
    await loader.reload();
    const command = loader.getExtensions().extensions.flatMap((extension) => [...extension.commands.values()]).find((entry) => entry.name === "scope")!;
    const notify = vi.fn();
    const ctx = { cwd: directory, sessionManager: SessionManager.inMemory(directory), ui: { notify } } as unknown as Parameters<typeof command.handler>[1];
    await command.handler("", ctx);
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("page 1/1"), "info");
    await command.handler("tree invalid", ctx);
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("/scope tree"), "warning");
    expect(requests).toHaveLength(0);
  });

  it("gives recovery instructions for incomplete retrieval calls", async () => {
    const loader = new DefaultResourceLoader({
      cwd: directory, agentDir: directory, settingsManager: SettingsManager.inMemory(), noExtensions: true,
      noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [piScopes],
    });
    await loader.reload();
    const tool = loader.getExtensions().extensions.flatMap((extension) => [...extension.tools.values()]).find((entry) => entry.definition.name === "scope")!.definition;
    const ctx = { cwd: directory, sessionManager: SessionManager.inMemory(directory) } as unknown as Parameters<typeof tool.execute>[4];
    await expect(tool.execute("missing-scope", { action: "read" }, undefined, undefined, ctx)).rejects.toThrow('scope({"action":"inspect"})');
    await expect(tool.execute("missing-item", { action: "read", scopeId: "sc_1234567890" }, undefined, undefined, ctx)).rejects.toThrow("read requires item");
    await expect(tool.execute("wrong-action", { action: "inspect", scopeId: "sc_1234567890", item: 1 }, undefined, undefined, ctx)).rejects.toThrow("Use action read");
    await expect(tool.execute("old-action", { action: "fork", goal: "Investigate" }, undefined, undefined, ctx)).rejects.toThrow("Use run, inspect, or read");
    await expect(tool.execute("bad-context", { action: "run", context: "invalid", goal: "Investigate" }, undefined, undefined, ctx)).rejects.toThrow("context must be fresh or fork");
    expect(requests).toHaveLength(0);
  });

  it("lets the parent discover and retrieve evidence without another child or work execution", async () => {
    mode = "retrieve";
    const settingsManager = SettingsManager.inMemory();
    const loader = new DefaultResourceLoader({
      cwd: directory, agentDir: directory, settingsManager, noExtensions: true, noSkills: true,
      noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [piScopes],
    });
    await loader.reload();
    ({ session: parentSession } = await createAgentSession({
      cwd: directory, agentDir: directory, ...parent(), modelRuntime: runtime,
      tools: ["scope"], resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(directory),
    }));
    await parentSession.prompt("Investigate, then inspect and read the retained evidence.");
    expect(requests).toHaveLength(6);
    const childRequests = requests.filter((request) => request.tools.some((tool) => tool.function.name === "scope_return"));
    expect(childRequests).toHaveLength(2);
    const tools = requests.at(-1)!.messages.filter((message) => message.role === "tool");
    expect(JSON.stringify(tools[0])).toContain("Supporting tool evidence:");
    expect(JSON.stringify(tools[1])).toContain("1. read");
    expect(JSON.stringify(tools[2])).toContain("Recorded output:");
    expect(JSON.stringify(tools[2])).toContain("fixture evidence");
    const store = new ScopeStore(path.join(directory, "scope-data"), parentSession.sessionId);
    const children = (await store.listScopes()).filter((scope) => scope.kind === "subsession");
    expect(children).toHaveLength(1);
    const trace = await store.readTrace(children[0]!.id);
    expect(trace.filter((event) => event.type === "pi.tool_execution_start")).toHaveLength(2); // original read + return only
  });

  it.each([true, false])("fresh project guidance respects repoInstructions=%s without loading global files", async (repoInstructions) => {
    const cwd = path.join(directory, "workspace");
    await mkdir(cwd);
    await writeFile(path.join(directory, "AGENTS.md"), "GLOBAL_RULES_EXCLUDED");
    await writeFile(path.join(cwd, "AGENTS.md"), "PROJECT_RULES_INCLUDED");
    await writeFile(path.join(cwd, "evidence.txt"), "fixture evidence");
    const kernel = await createKernel(cwd);
    const capsule = await kernel.fork({ goal: "Investigate", repoInstructions, parent: parent() });
    expect(capsule.context).toBe("fresh");
    expect(JSON.stringify(requests).includes("PROJECT_RULES_INCLUDED")).toBe(repoInstructions);
    expect(JSON.stringify(requests)).not.toContain("GLOBAL_RULES_EXCLUDED");
    const entry = (await kernel.store.readTrace(capsule.scopeId)).find((event) => event.type === "scope.context");
    expect(entry?.data).toMatchObject({ mode: "fresh", guidance: repoInstructions ? "project files" : "disabled" });
  });

  it("reports oversized project guidance before any child inference", async () => {
    await writeFile(path.join(directory, "AGENTS.md"), "x".repeat(32_001));
    const kernel = await createKernel();
    const capsule = await kernel.fork({ goal: "Investigate", parent: parent() });
    expect(capsule.status).toBe("failed");
    expect(capsule.error).toContain("32,000");
    expect(requests).toHaveLength(0);
  });

  it.each(["parent", "timeout"] as const)("cancels a streaming child on %s abort", async (source) => {
    mode = "wait";
    const kernel = await createKernel();
    const controller = new AbortController();
    const pending = kernel.fork({ goal: "Wait", parent: parent(), signal: controller.signal,
      timeoutMs: source === "timeout" ? 100 : 5_000 });
    if (source === "parent") {
      await requested;
      controller.abort(new Error("test cancellation"));
    }
    const capsule = await pending;
    expect(capsule.status).toBe("cancelled");
    expect(kernel.scopes.get(capsule.scopeId)?.runtime.state).toBe("disposed");
    await expect(access(kernel.store.scratchPath(capsule.scopeId))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never prompts a child when the parent signal was already aborted", async () => {
    const kernel = await createKernel();
    const result = await kernel.fork({ goal: "Do not start", parent: parent(), signal: AbortSignal.abort() });
    expect(result.status).toBe("cancelled");
    expect(requests).toHaveLength(0);
  });

  it("retains recoverable text when the child does not call scope_return", async () => {
    mode = "partial";
    const kernel = await createKernel();
    const capsule = await kernel.fork({ goal: "Investigate", parent: parent() });
    expect(capsule).toMatchObject({ status: "partial", summary: "Recoverable investigation" });
    expect(capsule.fallbackReason).toContain("without calling scope_return");
  });

  it.each(["fresh", "fork"] as const)("limits %s investigation then returns a partial capsule with all usage", async (context) => {
    mode = "budget";
    const kernel = await createKernel();
    const capsule = await kernel.fork({ goal: "Investigate evidence.txt", context,
      ...(context === "fork" ? { snapshot: { entries: [], systemPrompt: "Inherited rules", parentSessionId: "test", parentEntryId: null } } : {}),
      maxTurns: 2, parent: parent(), timeoutMs: 500 });
    expect(capsule).toMatchObject({ status: "partial", ...findings });
    expect(requests).toHaveLength(3);
    expect(requests[2]?.tools.map((tool) => tool.function.name)).toEqual(["scope_return"]);
    expect(capsule.usage?.totalTokens).toBe(42);
    expect(kernel.scopes.get(capsule.scopeId)?.budget).toMatchObject({ maxTurns: 2 });
    expect(kernel.scopes.get(capsule.scopeId)?.runtime.state).toBe("disposed");
  });

  it("bounds ignored return instructions without executing more work", async () => {
    mode = "ignore-return";
    const kernel = await createKernel();
    const capsule = await kernel.fork({ goal: "Investigate", maxTurns: 1, parent: parent(), timeoutMs: 500 });
    expect(requests).toHaveLength(3); // one investigation + two return attempts
    expect(capsule.status).toBe("failed");
    const events = await kernel.store.readTrace(capsule.scopeId);
    const results = events.filter((event) => event.type === "pi.tool_execution_end").map((event) => event.data as { isError: boolean });
    expect(results.filter((event) => !event.isError)).toHaveLength(1);
  });

  it("accepts an explicit partial return before exhausting the allowance", async () => {
    mode = "partial-return";
    const kernel = await createKernel();
    const capsule = await kernel.fork({ goal: "Investigate", parent: parent(), timeoutMs: 500 });
    expect(capsule).toMatchObject({ status: "partial", ...findings });
    expect(requests).toHaveLength(2);
    expect(capsule.fallbackReason).toBeUndefined();
  });

  it("allows one validation repair in the return-only phase", async () => {
    mode = "repair-return";
    const kernel = await createKernel();
    const capsule = await kernel.fork({ goal: "Investigate", maxTurns: 1, parent: parent(), timeoutMs: 2_000 });
    expect(capsule).toMatchObject({ status: "partial", ...findings });
    expect(requests).toHaveLength(3);
    expect(capsule.usage?.totalTokens).toBe(42);
  });

  it.each(["parent", "timeout"] as const)("honors %s cancellation during return without more inference", async (source) => {
    mode = "wait-return";
    const kernel = await createKernel();
    const controller = new AbortController();
    const pending = kernel.fork({ goal: "Investigate", maxTurns: 1, parent: parent(), signal: controller.signal,
      timeoutMs: source === "timeout" ? 200 : 2_000 });
    await returnRequested;
    if (source === "parent") controller.abort();
    const capsule = await pending;
    expect(capsule.status).toBe("cancelled");
    expect(requests).toHaveLength(2);
    expect(kernel.scopes.get(capsule.scopeId)?.runtime.state).toBe("disposed");
    await expect(access(kernel.store.scratchPath(capsule.scopeId))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([0, -1, 1.5, 51, NaN, Infinity])("rejects invalid maxTurns %s before starting", async (maxTurns) => {
    const kernel = await createKernel();
    await expect(kernel.fork({ goal: "Investigate", maxTurns, parent: parent() })).rejects.toThrow("maxTurns");
    expect(requests).toHaveLength(0);
  });

  it("disposes the child session even when trace flushing fails", async () => {
    const dispose = vi.spyOn(AgentSession.prototype, "dispose");
    const detach = vi.spyOn(ChildTraceRecorder.prototype, "detach");
    const flush = ChildTraceRecorder.prototype.flush;
    vi.spyOn(ChildTraceRecorder.prototype, "flush").mockImplementation(async function (this: ChildTraceRecorder) {
      await flush.call(this);
      throw new Error("trace flush failed");
    });
    const kernel = await createKernel();
    const capsule = await kernel.fork({ goal: "Investigate", parent: parent() });
    expect(capsule).toMatchObject({ status: "failed", error: "trace flush failed" });
    expect(detach).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    await expect(access(kernel.store.scratchPath(capsule.scopeId))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
