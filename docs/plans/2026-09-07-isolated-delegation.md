# Usable Isolated Delegation Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Make `scope run` usable with owner-selected Docker execution, a project snapshot and retained evidence, without granting host work tools.

**Architecture:** Keep the existing in-process child and fresh/fork API. Owner environment selects host (default) or Docker with a pinned local image. Docker imports a clean committed Git snapshot into an unmounted guest workspace; a narrow Bash tool captures bounded output directly into owned evidence blobs rather than SDK temporary files. Scope cancellation and final cleanup own the entire container.

**Tech Stack:** Existing Node, Git, Docker, Pi SDK, TypeBox and Vitest; no new dependency or paid inference.

## Deliverable and boundaries

- `PI_SCOPES_EXECUTION=docker` plus `PI_SCOPES_DOCKER_IMAGE=sha256:<full local ID>`; unknown/missing configuration fails, never silently falls back. No model-facing permission flag.
- Fresh and fork both available; Docker child work tools are Bash only. Guest cwd and limitations explicitly supplied. Host mode unchanged.
- Clean committed Git input only for this version, including nested cwd. Refuse dirty/non-ignored untracked files, symlinks, submodules and oversized snapshots before inference. Ignored/untracked secrets and `.git` are not imported; committed secrets are not redacted. No Git hooks/filters or recursive host symlink copying.
- Retain bounded stdout/stderr and capsules after container removal, including failed commands. No arbitrary file export or automatic promotion. Return useful text/diffs via commands, not disappearing artifact paths.
- Persist container identity before creation; cleanup state must not say disposed if verification failed. Reconcile recorded containers on session reopen, without claiming an independent crash-time kill deadline.

## Steps

1. Write snapshot/policy and end-to-end Docker tests that fail against the current implementation. Add small Git-object export and safe Docker import, not a generic filesystem mirroring system.
2. Connect policy/metadata, child lifecycle and owned Bash output. Reuse existing capsule, accounting and evidence retrieval. Add failure/cancellation and unavailable-tool checks.
3. Run real Docker plus real-Pi/scripted-provider tests, source review, regression checks and documentation. Checkpoint the entire usable path, not individual layers.

## Verification

`PI_SCOPES_TEST_DOCKER_IMAGE=<local image ID> npm test`, `npm run check`, `git diff --check`, `npm pack --dry-run`, and check no owned test containers remain. Default tests must remain Docker-independent with explicit skips. Real checks use synthetic canaries and no actual credentials. Docker/macOS validation does not imply native-Linux or public security certification.

## Implementation and review record

The complete path is implemented: owner policy in `ScopeKernel`, Git-object snapshot/input validation, isolated child session/tool selection, owned output capture, source-revision metadata, cancellation and container reconciliation. The model-facing run/fresh/fork interface did not acquire permission tiers. Host mode remains the default. No new dependencies or paid model calls.

Initial snapshot and end-to-end checks failed before implementation. Two substantive issues found during real checks were fixed rather than weakening the boundary:

- Docker rejects `docker cp` against a read-only rootfs, even for this tmpfs target. Import now uses a host-owned regular-file archive streamed to guest tar under the ordinary non-root user; no writable rootfs, root import process or CHOWN capability was added.
- `git status` can execute configured clean filters on the host. A synthetic filter regression reproduced that side effect. Input verification now uses index plumbing plus bounded literal-byte comparison, and disables lazy object fetching/fsmonitor hooks. It does not run working-file diff/filter machinery.

Static AGY review identified missing/deleted input diagnostics, empty nested cwd and cancellation responsiveness; regression checks and fixes were added. It did not execute tests. Its suggested `isError` return flag would be ignored by Pi's tool execution layer: instead, the evidence reader now preserves explicit exit/failure metadata alongside raw owned blobs. Returning an exit code as data is not a claim that a failed command succeeded.

Fresh full verification: **91 tests passed**, including real Docker and real Pi with a scripted provider, plus TypeScript and diff checks. Docker-specific coverage exercises fresh/fork copy edits, root guidance/nested cwd, absent host tools, post-cleanup retrieval, nonzero command output, cancellation before creation/during import/inference/work, cleanup failure blocking, and reopen reconciliation. Default invocation skips the 22 Docker cases; no model-effectiveness claim follows from deterministic checks.

Remaining limits are part of the contract: clean literal committed input only, bounded small snapshots/output, preinstalled dependencies, no arbitrary file export/promotion, no independent crash-time watchdog, no native-Linux run or runtime/kernel-exploit certification. Startup/daemon control cancellation is checkpointed and time-bounded, not a guarantee of immediate daemon cancellation; ambiguous failures may require reconciliation. Current-user host interference during snapshot creation and malicious owner infrastructure are outside this boundary.
