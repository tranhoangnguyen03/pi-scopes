# Sandbox equipment survey

Desk research, 2026-09-07. Documentation/source observations only; no images installed or executed. Upstream main branches and docs are mutable and may not describe a particular deployed release.

## Owner philosophy

Get out of the way of agents doing good work. Start with a capable environment and minimal justified constraints; introduce additional safeguards in response to observed problems. The prototype's small resource ceilings, clean-input restrictions and offline operation are implementation choices to revisit, not immutable product principles. Preserve truthful status, working cancellation, data-integrity checks and the explicitly promised boundary; do not silently turn an isolated child into host execution or expose credentials. No runtime settings changed by this research.

## What others supply

### E2B

The documented default Debian-based `base` template includes Python 3, Node.js, Yarn, Git, curl, build-essential and GitHub CLI. The public Dockerfile explicitly provisions compiler/build tools as well as runtimes, rather than just a shell. The inspected file uses historical Python/Node pins; use it as evidence of equipment categories, not a recommendation to copy its versions.

Templates can start from common runtime/distro images or a custom registry image. Project-specific dependencies can be built into templates. The documented base starts at 2 vCPU / 512 MiB, with resources selected at template build time. This is a vendor default, not a suitable universal value for our workloads. Browser/desktop/data-analysis capabilities must be checked for the specific template; do not attribute them all to base.

Sources:
- https://docs.e2b.dev/template/base-image
- https://github.com/e2b-dev/E2B/blob/main/templates/base/e2b.Dockerfile

### OpenHands

The current custom-sandbox guide says default agent-server images include Python and Node.js. The inspected SDK Dockerfile's minimal stage adds Bash, certificates, curl/wget, Git, jq, tmux, tar, compiler/build tools, coreutils, process/file/search utilities and uv. It grants its internal user passwordless sudo, showing a design that permits environment modification inside the sandbox rather than suppressing every operation.

Full builds additionally provide GitHub CLI and selectable browser (Chromium), VSCode Web and Docker components; minimal targets omit those larger capabilities. The source also provisions selected ACP agent providers with a separate Node runtime, with a compatibility check rather than assuming every base image can execute them. Installed components do not prove every deployment grants the privileges/network/auth they need. In particular, a Docker executable is not permission to mount the host Docker socket.

OpenHands V1 runs its agent-server inside the sandbox; that differs from our host-side child inference with guest command execution. Its image is useful equipment research, not a drop-in runtime or a reason to import a second agent stack.

Sources:
- https://docs.openhands.dev/openhands/usage/advanced/custom-sandbox-guide
- https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-agent-server/openhands/agent_server/docker/Dockerfile

### Gondolin

Custom-image configuration examples include Bash, certificates, curl, Node/npm, Python, uv and SSH, with additional runtimes/packages and post-build commands available. These are documented configuration examples; the limitations page describes default images as intentionally minimal. An OCI rootfs route supports additional userspace choices while retaining Alpine boot/build infrastructure (the general limitations page is less specific).

Its distinguishing equipment is also infrastructural: programmable filesystem providers, mediated network access, supported HTTP credential substitution and disk checkpoints. These can support useful service access without passing a host home directory or raw credentials through. They do not automatically inherit arbitrary Pi extensions. See the separate environment comparison for protocol/deployment limits.

Sources:
- https://earendil-works.github.io/gondolin/custom-images/
- https://earendil-works.github.io/gondolin/limitations/
- https://earendil-works.github.io/gondolin/security/

### Daytona

The documentation presents sandboxes as computers where agents can install packages, run servers, compile code and manage processes. It offers existing snapshots and custom images rather than one universal equipment list. The inspected page documents Python/JavaScript/TypeScript direct code-execution runtime choices; this does not mean those are the only languages shell execution can support or that every language is preinstalled in every snapshot.

Documented ordinary small configurations start at roughly 1 vCPU, 1 GiB memory and 3 GiB storage, with larger snapshots and resizing. Exact quotas vary by class/account. The notable contrast is GiB-scale working environments, not our 16 MiB workspace. We did not inspect a default Daytona image manifest and therefore do not assert a precise executable/browser inventory.

Source:
- https://www.daytona.io/docs/en/sandboxes/

## Shared pattern

Useful environments combine:

1. A broad mundane developer toolbox, not a proliferation of LLM tools.
2. Runtimes AND package/build tools to obtain or compile project dependencies.
3. A way to extend the environment (templates, custom images or in-sandbox installation).
4. Enough disk, memory and process support for real builds, caches and services.
5. Optional larger facilities for browser/UI work and external services.

Different products set different network/privilege policies. The research does not support claiming they all allow unrestricted access or all require preinstallation. None provides evidence that merely switching sandbox engines reproduces arbitrary parent extension behavior.

## Recommendation for pi-scopes

Adopt a useful general development image recipe, not a tiny fixture image or a giant assortment of every language. Proposed initial equipment:

- Bash, Git, standard Unix tools, ripgrep, jq, tar/zip/unzip, certificates, curl/wget, process inspection.
- Supported Node/npm and Python/pip/venv/uv versions; package-manager availability checked rather than assumed.
- make and C/C++ build essentials for native dependencies.
- Writable project/temp/cache locations with resources suitable for the selected real build.
- Browser automation/Chromium where frontend work is in scope; do not confuse installation with an authenticated parent browser session.

Additional runtimes and project packages should be installable or provisionable without a source-code change to pi-scopes. Decide the network/write authority once for the chosen environment rather than forcing per-command approval theatre. Current offline/read-only configuration must be explicitly changed and verified to enable that experience; installing npm into the current image alone will not do it.

Keep agent-facing surfaces simple: a concise statement of capabilities and real restrictions, then ordinary shell work. Do not make the agent memorize a compatibility encyclopedia or ask the user to mediate every missing command. Provisioning/network/credential decisions remain explicit rather than accidental.

Next implementation proposal should specify a usable environment, measure an actual build's needs, and distinguish boundary protections from provisional resource defaults. No fixed replacement RAM/disk numbers are selected by this survey. Compact patch optimization remains deferred.
