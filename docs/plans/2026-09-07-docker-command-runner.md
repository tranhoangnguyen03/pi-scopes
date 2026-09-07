# Docker Command Runner Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Establish an internal, fixture-tested command boundary before connecting it to `scope run`.

**Architecture:** One Docker container per runtime, host inference unchanged. A small `BashOperations`-compatible adapter runs commands only inside that container; cancellation/command timeout/output overflow removes the whole container. No workspace import, automatic image provisioning, artifact promotion or public mode in this slice.

**Tech Stack:** Node child_process, existing Pi SDK type, existing Vitest, locally installed Docker. No new dependency or paid model call.

---

This is a single-writer exploratory slice in the existing checkout. The approved direction/report was committed first; no parallel agents or worktree orchestration are needed for this spike.

### Task 1: Executable checks first

- Create `test/docker-runtime.test.ts` with mutable-image rejection and opt-in real-Docker checks for mount/network/env policy, persistent writable scratch, host-canary protection, command injection remaining inside the container, detached-process teardown, timeout and output overflow.
- Real runtime tests require `PI_SCOPES_TEST_DOCKER_IMAGE` containing a complete local `sha256:` image ID. No pull/build. Default `npm test` skips real-runtime cases when that prerequisite is absent; an explicitly supplied unavailable image must fail, not skip.
- Run the new tests against a minimal unimplemented API to observe expected failures before implementing behavior.

### Task 2: Minimum adapter

- Create `src/runtime/docker.ts`: `DockerRuntime.create(image)`, `exec(command, cwd, options)` compatible with `BashOperations`, `dispose()`.
- Require immutable local image identity. Fixed runtime policy: non-root, no network/mounts/host namespaces, read-only root, limited writable tmpfs, dropped capabilities, no-new-privileges, CPU/memory/PID caps. Use argv-based Docker invocation, never a host shell.
- Ignore passed-through work-tool env; keep container cwd `/workspace`. Bound control-command output/time and streamed work output. Do not promise SDK overflow ownership: this adapter is tested directly, outside the SDK accumulator.
- Kill/remove and verify absence of the named runtime on cancel/timeout/overflow. Keep failures explicit; never use local Bash as fallback. Do not claim crash recovery, restart reconciliation or independent runtime lifetime yet.

### Task 3: Verify and document limits

- Run `PI_SCOPES_TEST_DOCKER_IMAGE=<local full image ID> npm test -- test/docker-runtime.test.ts`, then full `npm test`, `npm run check`, `git diff --check`.
- Record the actual runtime/image/platform and real vs skipped checks in `docs/STATUS.md`.
- Keep the runtime disconnected from `PiChildExecutor` until source import, output ownership, policy selection and lifecycle integration are addressed. No public sandbox claim or publication.

## Implementation record

Implemented the internal adapter and 13 checks. Five initial checks failed against an unimplemented skeleton before implementation. Static AGY review then led to three reproduced failures (busy state after synchronous spawn validation, external disposal returning an ordinary exit result, and a cached cleanup rejection preventing explicit retry), plus one reproduced loss of pre-abort context on cleanup failure. These now pass. The host Docker client and output streams are stopped immediately during teardown; container removal is still awaited and verified separately. Control commands use a 15-second SIGKILL deadline and 64 KiB output buffer. Work output is capped at 1 MiB; command deadline defaults to 300 seconds and cannot exceed that. Both are experimental runtime resource limits, not inference-budget policy.

The reviewer did not execute commands. Its suggestion that a timer necessarily races a successful close was not established by the microtask ordering; timer/listener cleanup was nevertheless moved next to close for clarity. A failed `rm` followed by a successful exact-name absence query remains acceptable proof of absence; matching error prose is weaker. No platform-selection knob was added: the caller supplies a concrete installed image, and the actual platform is recorded.

Verified with all real-runtime cases enabled: **67 tests passed**, TypeScript and diff checks passed, no labelled containers left. New checks cover host canaries, env non-forwarding, readonly root, persistent guest scratch, tmpfs exhaustion, stdout/stderr overflow, normal nonzero exits, cancellation/deadline teardown, exclusive commands, setup validation and fail-closed cleanup retries. Docker 29.4.0 on macOS (Linux/aarch64 daemon) used existing Linux/amd64 image `sha256:caf3ef82cd1d4ebd1724ed8374c8b2d8f1396bfab80c024489006d6093b19ad3`. Eleven real-runtime cases skip without `PI_SCOPES_TEST_DOCKER_IMAGE`; two new checks remain Docker-independent.

## Still deliberately missing

- This adapter has no repo import or durable export and is not selected by the scope tool. Guest workspace is empty tmpfs; only fixture commands populate it.
- `BashOperations` output capture is outside this adapter. Connecting it directly to the existing SDK Bash wrapper would still create host overflow files. Do not claim storage integration is complete.
- Scope-wide cancellation/startup cancellation and idle-runtime lifetime are not wired. Startup/control calls have local deadlines; a host crash or ambiguous daemon timeout can still leave a labelled runtime needing reconciliation. No independent lifetime watchdog or startup scavenger exists yet.
- Tests verify Docker network/resource configuration, not comprehensive egress, fork-bomb, memory/CPU stress, runtime-exploit resistance, or native Linux behavior. Image-declared volume rejection is implemented but its failure branch lacks a dedicated fixture test.
- The image/runtime and Docker CLI/daemon are trusted infrastructure. A pinned image ID prevents tag drift, not a malicious image or daemon. No automatic pull/build/install, policy framework or host fallback was added.
