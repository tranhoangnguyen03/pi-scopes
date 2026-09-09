# Harder-task context study — 2026-09-05

## Decision

Resume development, not more unchanged benchmark runs. Parent-context isolation works mechanically, but these runs did not deliver useful child results before exhausting the task budget. Prioritize **self-contained delegation and bounded early return**, preserving budget for the parent to implement and verify. Do not expand orchestration yet.

This does not overturn the [successful easy-task pilot](2026-09-05-terra-high-pilot.md). It limits its generality: context reduction is only useful when the investigation comes back.

## Frozen experiment

Two investigation-heavy SWE-bench Verified tasks and one three-phase session, each baseline versus scopes. All tasks were labeled 1–4 hours for humans; that is not a calibrated model difficulty measure. One run per arm, no retries, no patched-up submissions or raised budgets.

- Model: `openai-codex/gpt-5.6-terra`, high thinking; Pi 0.85.0.
- Each arm: 15 minutes, 600,000 cumulative reported tokens including cached input, $1.50 catalogue estimate; combined parent + child accounting. In-flight responses can overshoot.
- Children: investigation only, 300-second timeout, parent owns final edits. Fresh host checkouts, not security sandboxes.
- Blockmatrix order baseline/treatment; Django treatment/baseline; printing baseline/treatment.
- Printing: consecutive readonly string investigation, readonly pretty/LaTeX investigation, then implementation. At most one child in each investigation; none during implementation. Parent compaction threshold deliberately lowered to 24,576 tokens, retaining 8,192; actual model window remained 272,000. Children retained default compaction settings.
- Official SWE-bench 5.0.2 grader; all three gold smoke checks passed before inference. macOS ARM64 host with emulated Linux AMD64 grading; host Python 3.9.6 versus image Python 3.9.20, consistent across arms.

## Results

| Task / arm | Official outcome | Time | Cumulative tokens | Estimated cost | Peak / final parent context | Compactions |
|---|---|---:|---:|---:|---:|---:|
| Blockmatrix baseline | Unresolved | 73.6s | 122,722 | $0.0949 | 16,240 / 16,240 | 0 |
| Blockmatrix scopes | Empty patch; budget stop | 208.0s | 634,985 | $0.3449 | 2,979 / 2,979 | 0 |
| Django aliases baseline | **Resolved**, saved patch at budget stop | 206.4s | 610,679 | $0.3265 | 40,052 / 40,052 | 0 |
| Django aliases scopes | Empty patch; budget stop | 191.6s | 629,810 | $0.3544 | 2,566 / 2,566 | 0 |
| Printing baseline | Empty patch; budget stop in implementation | 452.0s | 606,956 | $0.8035 | 60,896 / 21,882 | 5 |
| Printing scopes | Empty patch; budget stop in first investigation | 177.6s | 678,356 | $0.3864 | 1,949 / 1,949 | 0 |

Baseline resolved 1/3; scopes resolved 0/3, all empty patches. Official reports recorded zero infrastructure failures and zero grading errors. Empty patches were submitted and counted, not executed as test runs. All six inference runs together cost **$2.3105 catalogue-equivalent**, not an OAuth subscription invoice.

Every treatment child was cancelled by the shared token budget without a structured return or recoverable final summary. Raw `providerError: "This operation was aborted"` accompanies these intentional stops; it is not a provider rejection. Django baseline also stopped mid-verification, but its preserved patch resolved under the official grader. Printing baseline reached the third prompt, not completion of all three phases.

**Do not interpret the smaller treatment contexts or shorter failed sessions as successful savings.** They contain no returned investigation. Nor does this show scopes prevent compaction during successful long sessions: treatment never reached the later phases.

## Trace findings

1. **Handoffs omit important task context.** Children start fresh with `scope.goal`, not the parent transcript (`src/child/pi-child-executor.ts`). The blockmatrix handoff says “reported BlockMatrix multiplication issue” without its concrete reproduction; Django names the assertion without the public model/query reproduction. Printing supplies a more concrete investigation goal, but no explicit stop condition. Missing context is a plausible contributor, not an experimentally isolated cause.
2. **Investigation has no useful stopping boundary.** Children issued 29, 44, and 41 work-tool calls respectively, with no `scope_return`. They read broad files, inspect shallow git history, and keep probing. Blockmatrix reads the full block implementation/tests and explores many multiplication cases. Django spends calls correcting test selectors and configuring reproductions. Printing reads large printer files and explores other backends during the string phase. Its attempt to locate another installed SymPy found none; this host-shared execution is not a confinement guarantee.
3. **Cancellation preserves traces and usage, not useful findings.** The fallback capsule says no structured result was returned. A 300-second timeout does not protect a 600k cumulative-token allocation: all three children exhausted the latter first, leaving the parent no chance to edit.
4. **Local tests are insufficient correctness evidence.** Blockmatrix baseline's 16 local tests passed, but its official task remained unresolved. Its patch reconstructs typed zero blocks in `_blockmul`; this symptom-focused correction should not be described as a complete fix. Django's new focused test was interrupted, despite a separate 295-test run completing with skips/expected failures; official grading, not the agent's completion, establishes the recorded resolution.
5. **Repeated work is visible, but not cleanly attributable to compaction.** Exact repeated `read` requests (same path, offset, limit) were zero in all parent and child traces. Printing baseline nevertheless made 68 reads: 29/20/19 by phase. Phase two revisited five previously read paths; implementation revisited nine, including all three printer backends and tests. Its first phase explicitly corrected an earlier mistaken claim that `_print_MatAdd` was absent. Different ranges and necessary verification make file revisits an imperfect waste metric. Treatment never reached a continuation, so comparative re-investigation remains unmeasured.

## What to build next

A minimal reliable handoff: make the fresh-child contract explicit, require the concrete problem/reproduction and expected return, and reserve a bounded investigation allowance plus time to return a partial capsule before the parent budget is exhausted. Prefer an explicit incomplete result with evidence over an empty cancellation. Then repeat a small targeted acceptance check before buying another broad study.

This study does **not** establish which token threshold is optimal. Cached input dominates cumulative consumption, and every stopped run remained under the dollar and wall-time caps. The chosen token cap may be restrictive; changing it would be a new experiment, not a repair to these results. Three selected tasks, single samples, and deliberately stressed parent compaction do not support general success-rate or cost claims.

## Evidence and reproducibility

Raw study directory (local, not bundled into the package):

`/Users/davidus-tranus/Github/pi-scopes-evals/context-study-20260905T183349Z/`

- `preregistration.json`, per-task `config.json`, `run-arm.mjs`, `runner-sha256.txt`.
- `source-sha256.json`, exact `pi-scopes-working-tree.patch`, integration-test snapshot. All recorded source hashes matched after inference and grading; no product changes during the experiment.
- Each task/arm: `result.json`, `phases.json`, `events.jsonl`, native parent session, context samples, exact `solution.patch`, prediction, worktree status; treatment includes copied child traces/capsules.
- `summary.json`: measured usage, contexts, tool counts and exact read-repeat counts.
- Official reports: `gold.context-study-gold-20260905T183349Z.json`, `pi-scopes-baseline.context-baseline-20260905T183349Z.json`, `pi-scopes-treatment.context-treatment-20260905T183349Z.json`, plus grade logs.

Task bases: `sympy__sympy-17630` at `58e78209c8577b9890e957b624466e5beed7eb08`; `django__django-15128` at `cb383753c0e0eb52306e1024d32a782549c27e61`; `sympy__sympy-14248` at `9986b38181cdd556a3f3411e553864f11912244e`. Pi-scopes HEAD `6a5dc8b376b7cce3373147827e8d9f218a896f7a` plus recorded uncommitted snapshot; task-repo HEAD `3d07b464b7b311a0cbfb5ed5b2d8a3b96f84a33d`.
