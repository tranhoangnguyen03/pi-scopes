# First paired pilot: Terra / high

**Result:** both arms resolved the official SWE-bench task. Scopes reduced the parent's final reported context, but increased elapsed time and estimated cost. This is one operational pilot, not evidence of an average performance improvement.

## Experiment

- Run: `pilot-terra-high-20260905T181212Z`.
- Task: SWE-bench Verified `sympy__sympy-20590` (Symbol instances unexpectedly acquiring `__dict__`).
- Base commit: `cffd4e0f86fefd4802349a9f9b19ed70934ea354`.
- Model: `openai-codex/gpt-5.6-terra`, **high** thinking, both parents and the treatment child; parent model output limit set to 8,192 tokens and inherited by the child.
- Pi: `0.85.0`; pi-scopes: `6a5dc8b376b7cce3373147827e8d9f218a896f7a` plus the archived uncommitted capsule/lifecycle fixes.
- Identical prompt SHA-256: `b2ee3f015108f55d4610704c4d5d1bea16a4e30952bf5a51c226d7e33b3721a0`.
- Both parents used read/bash/edit/write/grep/find/ls. Treatment additionally exposed `scope`. The same prompt instructed exactly one investigation child if that tool was available. The child was instructed not to edit project files.
- Separate clean, shallow host checkouts; Python 3.9.6, mpmath 1.3.0, pytest 6.2.5 on macOS/arm64. No other Pi extensions, skills, or context files were loaded, apart from the shared experiment controls.
- Each arm had a 10-minute wall limit, 250,000 reported-token threshold, and $3 estimated-cost threshold. Usage was checked every 250 ms; in-flight responses could overshoot. Neither arm hit a limit. The child had a 180-second timeout.
- Official grading: `swebench==5.0.2`, task repository `3d07b464b7b311a0cbfb5ed5b2d8a3b96f84a33d`, locally built Linux/amd64 image with Python 3.9.20, one worker. The earlier gold-patch smoke resolved the same task before model inference.

## Measurements

Treatment totals include parent **and child**, without double-counting nested tool usage.

| Metric | Baseline | With scopes | Change |
| --- | ---: | ---: | ---: |
| Official task resolved | Yes | Yes | Tie |
| Inference wall time | 58.689 s | 98.986 s | +68.7% |
| Input tokens, excluding cache reads | 23,930 | 48,675 | |
| Output tokens | 1,847 | 3,817 | |
| Cache-read tokens | 107,520 | 112,640 | |
| Total cumulative tokens | 133,297 | 165,132 | +23.9% |
| Estimated API-equivalent cost | $0.091528 | $0.165682 | +81.0% |
| Final parent context, Pi-reported | 18,088 tokens | 9,438 tokens | −47.8% |
| Children | 0 | 1, completed | |

Combined estimated inference cost: **$0.257210**. These are catalog-price estimates for OAuth/subscription usage, not an invoice. Cumulative tokens include repeated/cached inputs; final parent context is a different measure and is not peak context.

The child used seven turns, 115,755 cumulative tokens, and an estimated $0.123030. Its capsule retained concrete source locations, runtime evidence, test results, and the recommended source change. Both arms produced the same source fix, with slightly different regression assertions.

## Correctness and review

Both official reports recorded one resolved instance and zero incomplete, ambiguous, infrastructure-failure, or error instances.

Captured tool output also confirms:

- Baseline: 13 Symbol tests passed; printing tests reported 810 passed, 81 skipped, and 9 xfailed.
- Treatment parent: 13 Symbol tests passed, plus a direct check that Symbol rejects arbitrary instance attributes. The child also ran the 13 Symbol tests before the fix.
- Both ran `git diff --check` successfully.

**Both patches have an additional review finding:** they insert `__slots__` before `Printable`'s class string, so that string is no longer its docstring. An AST check confirmed that the original class has a docstring and both patched versions do not. Official grading did not detect this. The patches are preserved exactly as generated; they were not repaired after evaluation.

The captured parent and child tool calls were inspected: no network requests, gold patches, hidden tests, or other task checkouts were accessed. Execution was nevertheless host-shared, not sandbox-enforced.

## Interpretation and next step

The context boundary works end to end, including a real structured child return and combined usage accounting. On this small task, forced delegation did **not** earn its extra time or computation: correctness tied, both shared a review flaw, and baseline ran broader local tests while finishing sooner.

One task, one attempt per arm, fixed baseline-first order, and provider caching prevent a general conclusion. The next experiment should preselect four additional tasks, including longer investigations, and keep this model/settings and all failures in the report. Do not expand features or claim a benefit from this pair alone.

## Artifacts

Full local evidence is retained at:

`/Users/davidus-tranus/Github/pi-scopes-evals/pilot-terra-high-20260905T181212Z/`

- `summary.json`: matched settings and machine-readable measurements.
- `baseline/` and `treatment/`: manifests, prompts, native sessions, events, results, and exact prediction patches.
- `treatment/scopes/`: retained child records, trace, and capsule.
- `pi-scopes-baseline.terra-high-baseline-20260905T181212Z.json` and `pi-scopes-treatment.terra-high-treatment-20260905T181212Z.json`: official grading reports.
- `verification-evidence.json` and `patch-review.json`: local test output and the docstring review check.
- `run-arm.mjs`: the one-off runner with a no-inference `--self-check`.
- `pi-scopes-working-tree.patch`, `pi-integration.test.ts`, and `source-sha256.json`: exact source snapshot; the product source was not changed between arms.

The earlier rejected `gpt-5.4` attempt remains separately recorded in `pilot-20260905T175604Z`; it is an infrastructure failure, not a scored model solution.
