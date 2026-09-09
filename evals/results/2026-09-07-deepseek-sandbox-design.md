# DeepSeek real-task observation: sandbox design — 2026-09-07

**Verdict: useful but mixed.** Scopes supported a real repository investigation and evidence-dependent follow-ups. It also carried factual mistakes forward with excessive confidence. This is evidence of working context/evidence mechanics, not evidence that autonomous security design is trustworthy.

## Attempt and settings

The preceding GLM attempt (`sandbox-design-20260907T074833Z`) was rejected before any tool call by a provider five-hour quota limit. Its artifacts remain unchanged. The owner explicitly authorized this retry with **`deepseek/deepseek-v4-flash`**; this does not change the standing preference for GLM in future checks.

- Artifact root: `/Users/davidus-tranus/Github/pi-scopes-evals/sandbox-design-deepseek-20260907T075204Z`.
- Source: `64dc6c62a9e84d17f3f22d13012b8be4d6eea8eb`, clean checkout before and after inference; Pi 0.85.1.
- Requested thinking: `off`; maximum output per response: 6,144 tokens.
- Same prompts/protocol as the blocked GLM attempt: one delegated investigation, then two follow-ups. Scope limit: 12 investigation turns, 240-second child timeout. Outer wall limit: 360 seconds per phase.
- Soft spending guidance: $0.15 combined; no cumulative-token cutoff. Parent/runner retries disabled; the shipped child executor permits one provider retry. No top-level failures/timeouts occurred.
- The new runner checks whether scope storage exists before copying it, addressing the failed attempt's secondary cleanup error. The old runner was not modified.
- Parent tools: `scope`, `read`, `bash`, `grep`, `find`, `ls`. Source rereading was allowed, so avoiding it on follow-up was observable rather than enforced. Only one child was allowed. Read-only/no-network/no-credentials instructions were behavioral constraints, not a sandbox.
- Preserved: runner, preregistration/exact prompts, source copies/hashes, selected SDK source, parent session/events, child traces, phase answers/usage, combined result, and an inference-free `verify.py`/`verification.json`.

## Actual task

Investigate this repository's execution/cleanup path and installed SDK seams; recommend the smallest credible command-execution isolation design for Linux/macOS. Follow-ups asked why sandboxing only Bash is insufficient, why stopping a Docker client may not stop container work, and what a defensible first implementation slice would promise/test.

This was design work with value to the project, not a hidden-answer fixture. It did not implement or execute a sandbox. No baseline, forced compaction, independent model reviewer or correctness grader was used.

## Behavior

| Phase | Parent behavior | Time | Incremental estimated cost | Final parent context estimate |
| --- | --- | ---: | ---: | ---: |
| Investigation | One fresh child, one evidence inspection, six direct source/navigation calls | 79.3 s | $0.0100272 | 13,764 tokens |
| First follow-up | `scope inspect` page 2, then `scope read` item 19; no source reopening | 15.1 s | $0.0007241 | 16,372 tokens |
| Final follow-up | No tools | 20.9 s | $0.0006797 | 18,637 tokens |

The child made 22 tool calls including its return, reached its investigation allowance, and returned a valid capsule during wind-down. Usage records count 15 assistant records, including return/aborted records; this is not 15 successful investigation turns. The parent initially repeated some investigation, including a failed guessed SDK path, before locating the Bash seam. Follow-up evidence reuse worked without new child launches.

The child's capsule said `complete` despite acknowledging uninspected files and approximate references. The harness stored `completed` as designed; that denotes an accepted model-reported outcome, not independent verification. The missing-work admission was buried in `conclusions`, not supplied through structured `unresolved` fields.

## Findings verified by the driver

Useful findings:

- Child inference is a separate in-memory SDK session in the host process (`src/child/pi-child-executor.ts`).
- `BashOperations.exec` is a real SDK seam for routing command execution elsewhere (`dist/core/tools/bash.d.ts`; `createShellToolDefinition` in `bash.js`).
- Leaving host-backed file/search tools available defeats an all-work-tools isolation claim. Child tool construction is centralized, so withholding them is a smaller first step than implementing several new remote adapters.
- Scope cancellation must be connected to the isolated runtime's lifecycle, not just the client process.

Material corrections—not accepted as design facts:

1. **“Only Bash spawns processes” is false.** SDK `grep.js` and `find.js` also spawn host search binaries. Their authority is the current user's, not “root-equivalent.” The relevant commonality is host execution, not whether each tool uses a subprocess.
2. **Host inference need not move merely to isolate a child.** A separate containerized child worker is possible without containerizing the parent; it introduces transport, snapshot and credential-routing work. The model incorrectly treated that architecture as impossible.
3. **There already is a total wall timeout.** `ScopeKernel.fork` creates a timeout that aborts the scope. The model's emphasis on turn count overlooked that. The real Docker issue is that killing a `docker exec` client is not proof that its container processes stopped; runtime teardown needs its own verified path.
4. **Closing output is not deleting output.** SDK `OutputAccumulator.closeTempFile()` ends a stream; it does not unlink the file. Replacing `BashOperations` does not move the host-side accumulator into Docker or redirect its temp directory. Output retention needs explicit design, not an assumed side effect.
5. **Copied secrets remain readable.** A sandbox cannot hide a secret deliberately copied into its workspace or inherited in conversation text. A container's own `/etc` is not the host's `/etc`. Proposed acceptance checks confused these distinctions and even suggested using real credentials; use synthetic canaries only.
6. **A scratch directory is not a security boundary.** Its current `0700` permissions do not confine a same-user process. The new boundary must come from the execution runtime, mount policy and closed host-tool paths.

SDK source and Pi's complete `docs/containerization.md`, `docs/security.md`, and Gondolin example were inspected to ground these corrections. This was a driver source review, not an independent security audit or runtime isolation test.

## Cost and input reuse

Combined parent-plus-child usage is already included in Pi parent totals; capsule usage is not added again.

| Uncached input | Cache-read input | Cache-write input | Output | Input cache-hit rate | Total estimated cost |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 54,409 | 266,368 | 0 | 10,957 | **83.0%** | **$0.0114310504** |

Total inference wall time: 115.3 seconds. Catalogue prices per million tokens: input $0.14, cache-read $0.0028, output $0.28, cache-write $0. Child contribution was $0.0075047896, already included above. Cost is a best-effort catalogue estimate, not an invoice, and excludes this interactive driver's review effort. The verifier recomputes it from normalized usage.

## What this bought us

A real integration seam, evidence reuse across follow-ups, and a concrete warning: **small retained context can preserve mistaken conclusions just as efficiently as correct ones.** No comparative savings or general quality advantage is established.

Proceed with a [source-corrected boundary proposal](../../docs/plans/2026-09-07-sandbox-boundary-proposal.md), not the raw model recommendation. Before security-sensitive reliance, make investigation-limit/provenance facts conspicuous rather than allowing a `completed` badge to stand in for verified conclusions. A larger capsule or more model turns is not automatically the fix.
