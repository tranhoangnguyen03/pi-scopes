# Bounded investigation acceptance check — 2026-09-06

## Current interpretation after owner policy clarification

The task resolved at **$0.3961 combined catalogue-equivalent cost**, including **$0.1325 for the child**. Combined usage was **81,873 uncached input**, **527,360 cache-read input**, **0 cache-write input**, and **10,573 output tokens**. Input cache-hit rate was **86.6%** (`527360 / (81873 + 527360)`).

The owner subsequently clarified that cost versus output quality—not a cumulative-token threshold—is the objective. Accordingly, the 3.3% token overage is not a task-quality failure. Future checks remove the cumulative-token cutoff and treat dollar thresholds as soft guidance. The frozen run, original acceptance criteria, and raw verification records below remain unchanged for auditability. The original recommendation to prioritize stricter budget classification is superseded by the [current evaluation policy](../README.md#current-evaluation-policy).

## Original result

**Useful handoff and task resolution demonstrated in one run; strict token-budget compliance was not.**

The child returned an honest, actionable partial capsule instead of consuming the whole task allowance. The parent added a regression test, observed the reported assertion fail, implemented the recommended fix, passed local verification, and produced a patch resolved by the official SWE-bench grader.

| Measurement | Result |
|---|---:|
| Task | `django__django-15128` |
| Model | `openai-codex/gpt-5.6-terra`, high |
| Pi | 0.85.1 |
| Official resolution | 1/1 |
| Child investigation turns | 8 |
| Child return calls | 1, structured `partial` |
| Child usage | 98,780 cumulative tokens; $0.1325 estimate |
| Combined usage | 619,806 cumulative tokens; $0.3961 estimate |
| Whole-task elapsed | 339.5 seconds |
| Child lifetime | approximately 131.6 seconds |
| Peak/final parent context | 34,249 tokens |
| Parent compactions | 0 |

Costs are catalogue-equivalent, not subscription invoices. Cumulative tokens include cached input.

## What was tested

A single new treatment run in a clean checkout at `cb383753c0e0eb52306e1024d32a782549c27e61`, using the existing isolated Python environment. Controls: exactly one child, eight investigation turns plus at most two return turns, 300-second child timeout, 15-minute overall timeout, 600k cumulative-token threshold and $1.50 estimated-cost threshold. No retries or post-run patch repairs.

The parent was asked for a self-contained handoff; the runner additionally appended the complete public issue/reproduction to the child goal. This is a **combined recipe check**, not proof that prompting guidance alone reliably produces adequate handoffs. Pi version, turn limits, and handoff content all changed since the [earlier study](2026-09-05-terra-high-context-study.md). No new baseline was run; do not infer causal effects or general superiority from historical comparisons.

The task's gold smoke previously passed in the earlier study. The existing official grader and task image were reused; no gold or hidden-test content was included in inference prompts.

## Evidence inspection

- Child trace contains eight investigation turns followed by `scope.wind_down`, an empty zero-usage aborted assistant record, then one `scope_return(outcome: "partial")`. Capsule usage reports ten assistant entries because it includes that aborted record; this is not ten completed investigation turns. No work-tool execution follows wind-down.
- The capsule identifies `Query.combine`, `table_alias`, `join`, and `change_aliases`, explains the overlapping alias map, and recommends reserving RHS aliases during allocation. It explicitly admits its scratch reproduction failed due to setup/import problems. Source reasoning and unverified runtime behavior are distinguished rather than presenting a fabricated successful reproduction.
- The parent then built its own regression test. Actual tool results show its initial `AssertionError`, followed by the focused test passing after the fix. `python tests/runtests.py queries --verbosity 1` reports 425 tests, OK with 9 skips and 2 expected failures.
- The official SWE-bench 5.0.2 report records one resolved task, zero infrastructure failures and zero errors.
- Patch inspection shows the proposed reserved-alias parameter passed through `combine`/`join`/`table_alias`, plus regression models and a test of the failing operand ordering. The new test does not explicitly cover the reverse ordering suggested by the child; official resolution is not exhaustive correctness proof.

## Budget caveat

The final response crossed the 600,000 cumulative-token threshold: **19,806 tokens (3.3%) over**. The runner samples reported usage every 250ms and clears its monitor after completion, so the raw result has `stopReason: null` despite exceeding the threshold. This is consistent with a soft sampled threshold, but does not satisfy a strict within-budget acceptance criterion. The raw record is preserved unchanged; the derived report explicitly marks that criterion unmet.

The extension's turn allowance successfully constrained investigation in this case. It did not reserve a specific parent token allocation, constrain per-turn output, or establish a hard billing cap.

## Recommendation

Keep the bounded-return behavior. It has now produced useful partial evidence in a real task, not just scripted tests. Do not raise the default or expand orchestration based on this one sample. Before a larger comparison, tighten the evaluation runner's final budget classification and capture the budget remaining at handoff. Those are evaluation improvements, not a reason to add another communication system.

## Artifacts

Local root: `/Users/davidus-tranus/Github/pi-scopes-evals/bounded-check-20260906T140102Z/`

- `preregistration.json`, `runner-sha256.txt`, `run-arm.mjs`, `source-sha256.json`, source patch and integration-test snapshot.
- `django-aliases/treatment/`: manifest, prompts, native session, events, child traces/capsule, exact solution patch, prediction, context samples and result.
- `grade.log` and `pi-scopes-treatment.bounded-check-20260906T140102Z.json`.
- `verification.json`: source/runner hashes, exact patch/base verification and derived acceptance decisions.

Product code was unchanged throughout inference and grading. This report records a bounded acceptance check, not a new benchmark success-rate estimate.
