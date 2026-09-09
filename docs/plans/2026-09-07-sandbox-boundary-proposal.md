# Proposal: a small, honest execution boundary

Status: **owner approved Docker as the first isolated-mode prerequisite on 2026-09-07.** The detailed boundary remains a proposal to validate during implementation, not a security guarantee. Current host-shared behavior remains unchanged. Grounded in the [real-task observation and driver corrections](../../evals/results/2026-09-07-deepseek-sandbox-design.md).

## In plain language

Keep the child's thinking here, but put **all its file and command work** in a disposable room. Give that room a selected copy of the project, not access to your actual project or home directory. Let it change its copy. Bring back evidence; do not automatically apply its changes.

Fresh/fork still answers **“What does the child know?”** The execution boundary separately answers **“What can it touch?”** A child can know about a host path from the conversation without being able to open it.

Recommended first implementation: **host inference + one Docker container per scope + Bash as the only work tool**, alongside the existing `scope_return`. No new messaging service, orchestration framework, or model-facing permission tiers.

## Alternatives considered

| Choice | Benefit | Cost / reason not first |
| --- | --- | --- |
| **Host inference, isolated commands** | Reuses in-process sessions/capsules and SDK `BashOperations`; provider credentials need not enter the container | Every alternative host-tool path must be absent; output and lifecycle still need deliberate handling |
| Entire child worker in a container | Easier to include additional child-side tools behind one process boundary | Requires a separate worker, snapshot/result transport and credential mediation. Possible without moving the parent, but larger |
| Gondolin micro-VM routing | Existing Pi example; a stronger kernel-separation option | Adds QEMU/Gondolin dependency and a broader adapter. Example mounts the real workspace read/write and forwards string-valued environment variables; it is not our desired policy unchanged |

Docker is a pragmatic first backend, **not a claim of protection against container-runtime/kernel exploits**. Docker Engine on Linux and Docker Desktop on macOS require actual platform tests; presence on this development machine is not cross-platform validation.

## Proposed boundary

### Trusted host side

- Parent and child SDK inference, provider authentication, policy selection, trace storage and validated `scope_return` stay on the host.
- Owner selects execution policy outside the model's tool arguments. A sandboxed run cannot request host mounts, credentials, privileged mode, another image or fallback execution through `goal` or Bash arguments.
- Trusted host code chooses a pinned, pre-provisioned runtime image. No automatic image pull/build or dependency installation during a scope.
- Capture stdout/stderr as untrusted data into host-owned evidence storage. Do not execute returned commands, follow model-supplied artifact paths, or interpret output as authority.

### Untrusted work side

- Only sandbox-routed `bash` and the callback-only `scope_return` are available. No host-backed `read`, `grep`, `find`, `ls`, extension tools or local-execution fallback. Bash supplies file/search/edit operations inside the container without a family of new adapters.
- One disposable runtime persists across the scope's commands, so files/build state remain usable. Commands run as a non-root user with no added capabilities, no-new-privileges, separate namespaces, no host network/PID sharing, and no Docker socket or agent-home mounts.
- Network is off. Dependencies must already be in the image or explicitly supplied inputs. Missing dependencies produce an honest limitation, not an escape to host execution or silent network access.
- Read-only runtime root; bounded writable workspace and temporary storage. Configure process, CPU, memory and storage limits through the host-owned policy. Verify storage enforcement on each supported runtime; a flag that only limits memory is not a disk quota.
- Container environment is constructed from a small allowlist, **not forwarded from SDK `env`**, which may contain host secrets. Use container-local cwd/home/scratch paths.

### Workspace input and output

- Do not bind-mount the parent checkout or the entire existing scope store. Use a disposable copy/volume; the host manifest describes exactly what was supplied.
- First end-to-end repository slice can support an explicit committed Git snapshot. Refuse unsupported dirty/untracked-work requirements with an actionable message rather than silently omitting them. Current-working-tree import can follow once its copying rules are tested.
- No `.git` administration directory, user home, sockets or host caches. Export must not run repository hooks/filters. Reject unsupported special entries/submodules, and never dereference source symlinks into outside host content. The first importer may reject symlinks explicitly rather than pretend they are safe.
- **This is not secret detection.** A tracked secret in selected input is still a supplied secret. Likewise, forked conversation or project guidance may contain sensitive text that reaches the model. Do not promise redaction or confidentiality from the chosen model provider.
- First slice retains bounded textual command evidence and the capsule only. Do not promise that arbitrary container file references survive teardown. Artifact export and patch promotion are separate later changes with path/type/size validation and review against the current parent tree. No automatic merge or copy-back.

### Cancellation, output and failure

- Reuse the existing total scope timeout and AbortSignal, but add runtime-owned teardown. Stop/remove the **container**, not just the host Docker CLI process, and verify termination before reporting disposal. Per-command timeout must not leave an untracked job behind.
- Failed startup or unavailable Docker => explicit failure, never host fallback. Failed teardown => visible cleanup failure with runtime identity, not `disposed`; prevent new work on that runtime and retain evidence needed for cleanup.
- Parent process crashes can skip `finally`. Label and record owned runtimes so restart can reconcile them. Do not promise an immediate kill deadline after host crash/daemon failure without an independent lifetime mechanism; that is a separate unattended-use gate.
- SDK `BashOperations` is the command-execution seam, **not an output-storage seam**. The surrounding Bash tool still creates a host `OutputAccumulator` and temp files. Decide and test owned overflow capture/removal before claiming bounded storage; changing `TMPDIR` globally would affect the parent and is not acceptable.
- Bound accepted output/trace growth as a resource-safety measure, independent of soft inference-cost guidance. Emit explicit truncation/failure evidence. Do not read or delete arbitrary `fullOutputPath` supplied by the child; only handle files created and registered by trusted capture code.

## First implementation slice, before model testing

1. Implement a small container lifecycle/command adapter against synthetic fixture input, at the existing `BashOperations` seam. Keep host execution as a separately selected trusted mode; no plugin framework.
2. Run deterministic adversarial checks below. Fake Docker/unit tests can verify arguments and failure transitions, but cannot establish isolation; run the actual runtime checks too.
3. Integrate the isolated tool set, source snapshot and evidence lifecycle into `PiChildExecutor`/`ScopeKernel`. Preserve fresh/fork, bounded return, cancellation and accounting tests.
4. Only then run one real repository task and follow-up in that boundary. Publication still requires Linux/macOS validation, compatibility review and clear limits.

The output-capture constraint may require a narrow tool wrapper in addition to `BashOperations`; resolve that in the first spike rather than copying the full SDK Bash implementation speculatively.

## Checks that must be able to fail the design

Use **synthetic files and fake credentials only**. Never use the owner's real secrets to prove a boundary.

- Place a unique canary outside the supplied project; try absolute paths, `..`, symlinks and host-path references inherited through fork context. The host canary must stay unreadable. Container-local `/etc` being readable is not a host escape.
- Include a different canary deliberately in the supplied snapshot. It should be readable: this confirms that copied content is not magically redacted. Verify excluded synthetic files are absent.
- Put a fake provider-key canary in host env/home. Confirm it is not present in container env/files or emitted output. Confirm no host-backed tools can be called under other names.
- Modify/create files inside the container; parent checkout and outside sentinels must remain unchanged. Attempt link/special-file exports; nothing should be promoted.
- Try network access against controlled test endpoints, including a simulated metadata target. No real cloud credentials, metadata service or external package installation is needed.
- Spawn detached/background processes; cancel during startup and execution, trigger both command/scope deadlines, and simulate host-client disconnect. Verify container processes terminate on orderly cancellation; separately verify restart reconciliation after a parent crash.
- Flood output and disk, exhaust processes, and fail the Docker daemon/cleanup path. Resource failure must be explicit, evidence bounded and no host fallback executed.
- Verify retained text remains retrievable after normal teardown, missing output is labelled, and forged artifact/full-output paths cannot cause host reads or deletion.

## Agent experience

Keep `scope({action:"run", context:"fresh"|"fork", goal})`. Show the selected execution environment in activity and capsule metadata, with a plain statement: “isolated copy; network off; no automatic promotion.” Supply container paths and available commands up front; inherited host paths are background, not working paths.

Errors should say what the agent can do next: missing dependency, unsupported snapshot, unavailable runtime, or failed cleanup—not suggest asking Bash for more permission. The model does not manage Docker or approval tiers.

## Owner decision

**Docker is approved as the prerequisite for the first isolated mode.** Start with an explicit experimental backend, using the existing installation rather than a second infrastructure stack. Keep trusted-host mode available by owner choice; never silently substitute it when isolation was requested. This approval is not approval to publish or claim a tested sandbox before the acceptance checks pass.
