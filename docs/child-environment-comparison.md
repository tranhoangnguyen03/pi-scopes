# Child execution environment: bounded design comparison

Status: desk evaluation of current pi-scopes and upstream documentation/source, not an installed backend trial. Existing checkpoint and runtime remain unchanged. This decision study precedes compatibility-warning implementation because warnings alone cannot make an under-equipped child useful.

## Product question

Can the parent delegate ordinary work without the user managing children, and without either agent repeatedly discovering missing tools/dependencies? Bash is the interface, not the capability. An installed Python interpreter is not the project's Python environment; curl is not an authenticated browser/MCP session.

Separate three layers:

1. Executables, runtimes and project dependencies.
2. Services, network destinations and credentials.
3. Pi runtime behavior: providers, permission hooks, prompt transformations, custom tools, compaction and orchestration.

A sandbox backend primarily addresses the first two layers. Arbitrary Pi extension compatibility requires separate integration regardless of backend. Forking text is not transferring runtime behavior or authority.

## Comparison

| Criterion | Equipped Docker copy | Gondolin micro-VM | Restricted host processes (SRT-style) |
|---|---|---|---|
| Existing pi-scopes investment | Current tested implementation | New integration and lifecycle validation | New integration and lifecycle validation |
| Tools/dependencies | Prepared image; base tools alone are insufficient | Custom guest image; packages/post-build commands; OCI rootfs option | Can reuse accessible installed host tools/dependencies |
| Network | Current mode denies all; controlled access would be new work | Host-mediated HTTP/TLS, allowlists, secret substitution; explicit SSH/TCP exceptions | OS process restrictions plus proxy policy; platform-specific details |
| Parent files | Current immutable input + disposable copy | Programmable VFS can support different policies; Pi example mounts project read-write | Allowed writes reach chosen host paths unless separately isolated |
| Project dependencies | Must be provisioned in a trusted build stage or image | Must be provisioned too; image build/network policy helps, not magic inheritance | Often already present, but read permissions, caches and helpers require care |
| Pi extensions | Not inherited by current child | Standard-tool overrides do not contain arbitrary extension host code | Wrapping shell commands does not contain the host Pi extension process |
| Setup burden | Docker/daemon and image; usual Linux container tooling | QEMU/default VM assets, optional experimental krun; custom image build requirements | OS sandbox prerequisites/policies; less image setup, more host-environment sensitivity |
| Target platforms | Current local macOS checks; Linux/WSL2 still need acceptance | Upstream macOS/Linux; WSL2 not established here, no native Windows support claim | macOS/Linux implementation; upstream Windows alpha irrelevant to initial WSL2 target |
| Main benefit | Shortest path from current working boundary to useful coding child | Richer controlled network/filesystem infrastructure without building it ourselves | Reuse the development environment rather than reproduce it |
| Main risk/cost | Owning provisioning; existing copy/resource limits are restrictive | Migration, nested VM support, network protocol/client compatibility | Exposing too much host state or implying parent hooks constrain child processes |

These are different authority models, not interchangeable performance options. No benchmark, escape resistance or startup speed comparison was run.

## Upstream findings and qualifications

### Gondolin

The project explicitly provides customizable images, programmable VFS and host-mediated network policies. Custom images support runtime packages and project dependencies; OCI rootfs import can use Debian/Ubuntu userspace while boot/build infrastructure remains Alpine-based. The limitations page still says "Only Alpine"; treat this as documentation ambiguity, not proof of universal distro support. Pin a release and test the exact build route before adopting it.

Its official Pi example overrides read/write/edit/bash and user shell commands. It does not transparently move every installed extension into the VM. It mounts the project read-write through RealFSProvider, so it is not evidence for our no-parent-mutation model. We would need to deliberately preserve that model or get approval for another one.

Network mediation has limits: HTTP/1.x focus, no general HTTP/2/3/QUIC/WebRTC support in the limitations page, and special policy for SSH/mapped TCP. Secret placeholders are useful for supported HTTP header flows but do not implement arbitrary auth workflows. Allowed destinations may still receive data the guest can read; reflected credentials and overly broad host policies remain risks.

Default images are intentionally minimal. QEMU/guest assets and custom image preparation are still requirements. macOS/Linux support does not establish nested virtualization or usable acceleration in the owner's VM/WSL2. The security document explicitly excludes malicious host/same-user attackers, hypervisor escapes, side channels and complete DoS isolation.

### Restricted-host execution

Anthropic Sandbox Runtime documents native OS restrictions for process trees: sandbox-exec on macOS and bubblewrap on Linux, with network proxies. This can reuse system tools and constrain local MCP-server processes. Its documented read default is broad unless denied; write and network allowances are separately controlled. Simply adopting the runtime is not equivalent to our disposable-copy boundary.

Executable access must also include needed libraries, caches and runtime paths. Per-user tool installations and platform policy differences can cause failures. Wrapping child Bash does not sandbox Pi extension JavaScript running in the trusted host process. Running an entire child Pi process inside a boundary is a distinct architecture with auth, lifecycle, extension side effects and result transport implications; not a drop-in fix for inheritance.

## Recommendation

**Keep the current Docker backend for the initial equipped-child trial; do not add a backend abstraction or migrate yet.** Supply and verify a practical development environment, then judge it on an actual owner's repository. This directly addresses the observed gap with the least discarded work.

Start with one documented image recipe for the selected workload, not a catalog of speculative language profiles. A plausible starting toolchain is Git, Bash, basic Unix tools, ripgrep, Node/npm and Python; exact versions and project dependencies must follow the chosen workload. No claim that this tool list is enough for arbitrary projects.

Provision project dependencies in a separate bounded container build/setup step, with deliberate network policy and no host secrets/mounts by default. Project install scripts are executable untrusted code, not harmless preparation; do not run them on the host. Freeze the resulting image/environment for execution. Network provisioning and image distribution require an explicit owner/design decision before implementation; current no-network/no-auto-install behavior is unchanged.

Give the parent and child a compact verified capability description: available runtimes, prepared project/environment identity, network policy, accessible services and meaningful exclusions. Avoid giant tool inventories. Distinguish missing executable from missing dependency or blocked service. Do not silently replace a service by scraping credentials or route work onto the host.

Investigate the existing prototype ceilings as functional readiness gates: 12 MiB source import, 16 MiB workspace/tmp and 256 MiB RAM can rule out ordinary Node/build tasks even with tools installed. If the selected real project fails these limits, adjust owner-controlled resource policy with tests; do not call this a diff optimization or conceal the limitation with warnings.

**Reconsider Gondolin** when ordinary tasks need controlled authenticated network/service access or programmable filesystem behavior and the alternative is implementing those mechanisms ourselves. First verify deployment/acceleration, an image with the needed dependencies, and the exact protocols. Prefer integration with established policy machinery to building a homegrown proxy/secret broker.

**Reconsider restricted-host execution** when reproducible images are an unacceptable burden and the owner accepts carefully scoped access to existing development tools/files. It must be a separate declared authority mode, not an automatic fallback.

## Next scope and acceptance

Before coding: choose one representative owner repository and target environment, identify its build/test dependencies and required external services, then decide the one-time provisioning policy. Do not infer permission to expose credentials/network from a generic request to make children useful.

Implementation acceptance for an equipped Docker child:

- Install/load package without development checkout dependencies.
- Parent/child both know the actual execution capabilities before expensive investigation.
- Ordinary task completes with real existing tests, not a bespoke fixture selected because the current image already supports it.
- Missing capability fails early with an actionable explanation; no host/network fallback.
- Original data and secrets remain outside the boundary unless deliberately supplied.
- Patch capture, cancellation and cleanup remain verified.
- User does not manually relay commands, construct a patch, or debug environment setup during the task.

This is a bounded product-readiness step. It does not promise arbitrary extension inheritance, automatic merge, universal dependency installation or a third sandbox implementation.

## Sources consulted

Upstream web documentation/source inspected on 2026-09-07; mutable upstream pages, not pinned API contracts. No Gondolin/SRT installation or runtime comparison was performed.

- https://github.com/earendil-works/gondolin
- https://earendil-works.github.io/gondolin/custom-images/
- https://earendil-works.github.io/gondolin/limitations/
- https://earendil-works.github.io/gondolin/security/
- https://github.com/earendil-works/gondolin/blob/main/host/examples/pi-gondolin.ts
- https://github.com/anthropic-experimental/sandbox-runtime
