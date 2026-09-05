# pi-scopes

`pi-scopes` is an experimental Pi extension for bounded child work. It lets the parent agent send noisy investigation into a separate context, retain the full trace, and receive a compact result capsule.

The first release is deliberately narrow. It supports one foreground, same-model child in a shared host workspace. It does not claim sandboxing, recursive agents, background execution, worktree isolation, or checkpoint recovery.

## Pi compatibility

The prototype pins `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` to `0.85.0`, and supports Linux and macOS first. CI covers Node 22.19 and Node 24 on both hosts.

## Development

```bash
npm install
npm run check
npm test
```

## Install from a checkout

```bash
pi install /absolute/path/to/pi-scopes
```

The model receives a single `scope` control tool. Human inspection is available through `/scope tree`, `/scope inspect <id>`, `/scope open <id>`, `/scope result <id>`, and `/scope traces <id>`.

The child resource loader is intentionally hermetic. It inherits Pi's configured built-in providers, but a provider registered dynamically by another extension is not automatically copied into the child runtime in v0.1.

See [`docs/v0.1-contract.md`](docs/v0.1-contract.md) for the exact guarantees and limits.

The first evaluation path is documented in [`evals/README.md`](evals/README.md). It writes official SWE-bench prediction JSONL and delegates grading to pinned `swebench==5.0.2`.
