# pi-scopes

Current milestone: [experimental bounded investigation + evidence retrieval](docs/STATUS.md).

`pi-scopes` is an experimental Pi extension for bounded child work. It lets the parent agent send noisy investigation into a separate context, retain the full trace, and receive a compact result capsule.

The first release is deliberately narrow. It supports one foreground, same-model child in a shared host workspace. It does not claim sandboxing, recursive agents, background execution, worktree isolation, or checkpoint recovery.

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

## Install from a checkout

```bash
pi install /absolute/path/to/pi-scopes
```

The model receives a single `scope` control tool. Goals must include the concrete question/reproduction, constraints, and expected evidence; children do not see the parent conversation. Investigations default to 8 turns (`maxTurns: 1–50`), followed when needed by at most two return-only turns. Children can explicitly return partial findings. This is not a token/cost cap, and the total timeout still applies. Human inspection is available through `/scope tree [page]`, `/scope inspect <id>`, `/scope open <id>`, `/scope result <id>`, and `/scope traces <id>`.

If the capsule omits supporting evidence, the parent can recover saved tool results without redoing the work:

```js
scope({ action: "inspect", scopeId: "sc_1234567890" }) // summary + numbered evidence list
scope({ action: "read", scopeId: "sc_1234567890", item: 1 }) // recorded call + output
```

Copy the actual scope ID from the capsule. Both responses include exact continuation calls when another page exists. Retrieval is confined to the current parent session, reads historical records only, and does not start a model or run commands. It excludes assistant thinking/transcripts; it is not secret-redacted. Deleted scratch files are not recovered, but full command output previously copied into retained storage can be read.

The child resource loader is intentionally hermetic. It inherits Pi's configured built-in providers, but a provider registered dynamically by another extension is not automatically copied into the child runtime in v0.1. Parent extension permission hooks, skills, and repository context files are not inherited either; the child's host `bash` is unrestricted.

See [`docs/v0.1-contract.md`](docs/v0.1-contract.md) for the exact guarantees and limits.

The first evaluation path is documented in [`evals/README.md`](evals/README.md). It writes official SWE-bench prediction JSONL and delegates grading to pinned `swebench==5.0.2`.
