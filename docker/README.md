# Equipped Docker children

Build explicitly once, from the package directory (requires Docker and Internet):

```sh
docker build -t pi-scopes-dev:local docker
export PI_SCOPES_EXECUTION=docker
export PI_SCOPES_DOCKER_IMAGE="$(docker image inspect --format '{{.Id}}' pi-scopes-dev:local)"
# Optional: allow project dependency downloads. Read the warning below.
export PI_SCOPES_DOCKER_NETWORK=bridge
pi
```

Start Pi in a clean committed project. macOS/Linux use Docker; Windows uses WSL2 with Docker integration. This recipe includes Bash, Git, ripgrep, jq, Node 24/npm, Python/pip/venv/uv, C/C++ build tools, curl and archive utilities. No browsers, language-specific SDKs, project dependencies or parent extensions are automatically added. Customize the image when needed. Runtime uses the exact local image ID and never pulls or builds automatically. The build recipe's base tag and apt repositories can change; pin `NODE_IMAGE` to a digest for a fixed base (apt packages still require separate pinning for reproducible rebuilds).

Children receive a compact on-PATH inventory, writable locations and effective policy, also recorded for the parent. This describes availability, not verified tool versions or project readiness. Bash is the work interface, not a restriction to shell builtins. For example, a child can run `npm ci`, or `uv venv /workspace/.venv` and install into that environment. System package installation is unavailable under the read-only root; prepare those packages in the image. Ignore generated dependencies in the original checkout before delegation so patch capture excludes them.

## Owner settings

Set before launching Pi; captured per scope, not model-facing arguments:

| Variable | Default | Accepted |
| --- | --- | --- |
| `PI_SCOPES_DOCKER_NETWORK` | `none` | `none`, `bridge` |
| `PI_SCOPES_DOCKER_MEMORY` | `2g` | Positive integer plus `m` or `g` |
| `PI_SCOPES_DOCKER_CPUS` | `2` | Positive finite number |
| `PI_SCOPES_DOCKER_PIDS` | `256` | Positive safe integer |
| `PI_SCOPES_DOCKER_WORKSPACE` | `1g` | Positive integer plus `m` or `g` |
| `PI_SCOPES_DOCKER_TMP` | `1g` | Positive integer plus `m` or `g` |

**Bridge networking can reach the host, LAN and Internet. It is not domain-filtered.** No host credentials, filesystem mounts or Docker socket are forwarded, but that is not a network isolation guarantee. Keep `none` if dependencies are already present and network access is unwanted. Invalid settings fail explicitly, without host fallback.

Resource defaults are adjustable prototype starting points, not a security or spending budget. Tmpfs limits are ceilings, not preallocation; actual tmpfs usage and processes share the container memory allowance. Both writable mounts permit executables so installed build tools can run. Files disappear after capture/cleanup; patches are retained, never automatically applied.

## Verification

The recipe was built locally and used to install pi-scopes' own 308 dependencies with `npm ci --ignore-scripts`, typecheck it, run 101 tests (32 Docker-dependent tests skipped because no daemon is exposed inside the guest), and capture a correct no-change result despite `node_modules`. A separate host-driven suite passed all 133 tests against this image. No paid inference was used. This does not verify arbitrary dependency install hooks, all project stacks, native Windows, or extension coexistence.
