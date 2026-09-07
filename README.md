# pi-scopes

Current milestone: [fresh/fork context modes + bounded investigation + evidence retrieval](docs/STATUS.md).

`pi-scopes` is an experimental Pi extension for bounded child work. It lets the parent agent send noisy investigation into a separate context, retain the full trace, and receive a compact result capsule.

The prototype is deliberately narrow. It supports one foreground, same-model child in a shared host workspace. Host execution is enabled without a separate consent gate for prototyping; children do not inherit parent permission hooks. Use only in a trusted environment. Enforced sandbox isolation is the later target for broader use, not a current capability. It does not claim sandboxing, recursive agents, background execution, worktree isolation, or checkpoint recovery.

## Pi compatibility

The prototype pins `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` to `0.85.1`, and supports Linux and macOS first. CI covers Node 22.19 and Node 24 on both hosts.

Parent and child communicate in-process through the Pi SDK and a `scope_return` callback. No socket server or intercom package is required. Pi 0.85.1 removes the need for our earlier `pi-server` packaging workaround.

## Development

```bash
npm install
npm run check
npm test
```

The tests include real Pi parent/child sessions against a local scripted HTTP provider: no model credentials or paid inference are required. These check integration, not model effectiveness. The [first paired SWE-bench pilot](evals/results/2026-09-05-terra-high-pilot.md) resolved the task in both arms: scopes reduced final parent context but increased time and estimated cost.

An internal Docker command-runner spike has opt-in real-runtime checks. It is **not connected to `scope run`**, which still executes on the host. Tests require a trusted, already-installed Linux image containing Bash and standard Unix utilities, with no declared volumes:

```bash
PI_SCOPES_TEST_DOCKER_IMAGE=sha256:<full-local-image-id> npm test -- test/docker-runtime.test.ts
```

No image is pulled or built. Without this variable, real-Docker cases are explicitly skipped; the regular suite remains Docker-independent. See the [runner plan and limits](docs/plans/2026-09-07-docker-command-runner.md).

## Install from a checkout

```bash
pi install /absolute/path/to/pi-scopes
```

The model receives a single `scope` control tool with two starting-context modes:

```js
scope({ action: "run", context: "fresh", goal: "Trace this concrete failure and recommend a focused fix…" })
scope({ action: "run", context: "fork", goal: "Investigate the alternative we discussed; return trade-offs…" })
```

Use **fresh** (default) for self-contained delegation: include the concrete problem, constraints, and expected evidence. Applicable project guidance is included by default; `repoInstructions: false` explicitly opts out. Use **fork** when the shared conversation matters: the child receives the active parent branch before the invoking assistant/tool batch, plus the effective system prompt. It receives no later parent updates, and its subsequent transcript stays out of the parent. Tools and permission hooks are not inherited in either mode. The former `action: "fork"` is removed, not an alias.

Investigations default to 8 turns (`maxTurns: 1–50`), followed when needed by at most two return-only turns. Children can explicitly return partial findings. This is not a token/cost cap, and the total timeout still applies. Human inspection is available through `/scope tree [page]`, `/scope inspect <id>`, `/scope open <id>`, `/scope result <id>`, and `/scope traces <id>`.

If the capsule omits supporting evidence, the parent can recover saved tool results without redoing the work:

```js
scope({ action: "inspect", scopeId: "sc_1234567890" }) // summary + numbered evidence list
scope({ action: "read", scopeId: "sc_1234567890", item: 1 }) // recorded call + output
```

Copy the actual scope ID from the capsule. Both responses include exact continuation calls when another page exists. Retrieval is confined to the current parent session, reads historical records only, and does not start a model or run commands. It excludes assistant thinking/transcripts; it is not secret-redacted. Deleted scratch files are not recovered, but full command output previously copied into retained storage can be read.

The child resource loader is intentionally hermetic. It inherits Pi's configured built-in providers, but a provider registered dynamically by another extension is not automatically copied into the child runtime in v0.1. Permission hooks and extension/skill runtimes are not inherited; the child's host `bash` is unrestricted. Fresh mode loads only project-root-to-cwd guidance (cwd only outside Git), with a 32,000-byte aggregate limit and explicit load failures. Fork mode reuses the inherited effective instructions instead of loading project files again; those instructions may include the parent's global guidance. This is context inheritance, not authority inheritance.

See [`docs/v0.1-contract.md`](docs/v0.1-contract.md) for the exact guarantees and limits.

The first evaluation path is documented in [`evals/README.md`](evals/README.md). It writes official SWE-bench prediction JSONL and delegates grading to pinned `swebench==5.0.2`.
