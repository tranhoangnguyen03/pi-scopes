# pi-scopes

Current milestone: [opt-in isolated delegation + fresh/fork context + retained evidence](docs/STATUS.md).

`pi-scopes` is an experimental Pi extension for bounded child work. It lets the parent agent send noisy investigation into a separate context, retain the full trace, and receive a compact result capsule.

The prototype supports one foreground, same-model child. **Default execution is host-shared and unrestricted**; children do not inherit parent permission hooks. Optional **Docker-copy execution** confines child work tools to a disposable project copy while inference stays on the host. This is experimental command isolation, not a security certification or unattended-use guarantee. No recursive/background children or automatic patch promotion.

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

Real Docker checks are opt-in and include the complete Pi → isolated child → retained-evidence path:

```bash
PI_SCOPES_TEST_DOCKER_IMAGE=sha256:<full-local-image-id> npm test
```

Use a trusted local Linux image with Bash, GNU tar and standard Unix utilities, and no declared volumes. No image is pulled/built. Without the variable, Docker cases are explicitly skipped; the regular suite remains Docker-independent.

## Install from a checkout

This is a private experimental package, not an npm registry release. Use Node 22.19+ or Node 24 and Pi **0.85.1**; other Pi versions have not been verified. Review the source first: the extension itself runs on the host with full access, even when child commands use Docker.

```bash
cd /absolute/path/to/pi-scopes
npm ci
pi install /absolute/path/to/pi-scopes
```

Local installation registers that directory; it does not copy it or install its dependencies. Keep the directory in place. Restart Pi after installation, then run `/scope tree` to confirm the extension is loaded without starting a child. To remove it: `pi remove /absolute/path/to/pi-scopes`.

**Before the first delegation:** choose the execution environment below. With no configuration, children can edit your real working directory. `context: "fresh"` does not mean sandboxed; fresh/fork controls conversation context, not filesystem authority.

For a first task, ask the parent to delegate one concrete investigation with a small scope and return evidence. In Docker mode, review the captured patch and recorded tests before separately applying anything; in host mode, edits already affect the shared checkout. A completed result is not an independent correctness guarantee.

### Optional isolated execution

Start Pi from a **clean committed Git checkout**, with an already-prepared local image:

```bash
export PI_SCOPES_EXECUTION=docker
export PI_SCOPES_DOCKER_IMAGE="$(docker image inspect --format '{{.Id}}' YOUR_PREPARED_IMAGE)"
pi
```

The child gets a copy under `/workspace`, with Bash as its only work tool. It can edit that copy, but **your checkout is not changed**. Network is off; dependencies must already be in the image. Captured command output, the result capsule, and an automatically captured workspace text patch survive cleanup; guest files do not. The child need not back up files or print a diff. Use `scope inspect/read` to retrieve the patch. Nothing is automatically applied or merged.

Patch capture covers added/modified/deleted UTF-8 regular files and executable-bit changes, against the imported source revision. Capture errors fail the scope explicitly; cancellation can leave capture unavailable. Limits: 12 MiB / 10,000 regular files exported, 20 MiB archive transport, 4 MiB retained patch, 200,000 combined old/new lines per changed file. Only portable ASCII paths (letters, digits, `_`, `.`, `/`, `-`) and ustar-representable names are currently supported. Symlinks, special files, `.git`, unsafe paths, and changed binary/non-UTF-8 files are refused, not silently omitted. New files ignored by the original checkout's Git ignore rules are excluded; tracked changes are never ignored. Global ignore files are disabled. Keep temporary work in `/tmp`.

This is bounded artifact handoff, not forensic proof: guest background processes can race capture, and compromised guest tools can lie. A captured patch still needs review and verification before application.

This version refuses dirty or non-ignored untracked work, symlinks, submodules and snapshots above 12 MiB / 10,000 regular files. Ignored files and `.git` are excluded. Committed secrets and inherited conversation text are **not redacted**. Missing Docker, invalid configuration or failed setup never silently falls back to host execution.

Use `PI_SCOPES_EXECUTION=host` to select trusted-host execution explicitly. Both starting-context modes remain available in either environment. See [the exact Docker boundary and limits](docs/v0.1-contract.md#docker-copy-execution).

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

The child resource loader is intentionally hermetic. It inherits Pi's configured built-in providers, but a provider registered dynamically by another extension is not automatically copied into the child runtime in v0.1. Permission hooks and extension/skill runtimes are not inherited. Host mode's Bash is unrestricted; Docker mode has only isolated Bash and `scope_return`. Fresh mode loads project-root-to-cwd guidance (from the copy in Docker mode; cwd only outside Git in host mode), with a 32,000-byte aggregate limit and explicit load failures. Fork mode reuses the inherited effective instructions instead of loading project files again; those instructions may include the parent's global guidance. This is context inheritance, not authority inheritance.

See [`docs/v0.1-contract.md`](docs/v0.1-contract.md) for the exact guarantees and limits.

The first evaluation path is documented in [`evals/README.md`](evals/README.md). It writes official SWE-bench prediction JSONL and delegates grading to pinned `swebench==5.0.2`.
