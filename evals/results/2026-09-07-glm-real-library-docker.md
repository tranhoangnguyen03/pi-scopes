# Real-library Docker delegation: more-itertools strict batching

## Verdict

One owner-authorized `9-router/glm-5.3` run completed a four-file enhancement and retrieved its patch after container disposal. A separate inference-free Docker verification applied the retained patch cleanly and passed the expanded suite and driver-authored checks. This is useful end-to-end evidence, not a paired benchmark or proof of production readiness.

## Reproduction and provenance

Artifacts: `../pi-scopes-evals/more-itertools-live-20260907T110533Z/` (outside the package; includes runner, preregistration, source snapshot/hashes/diff, original input, session, scope traces/blobs, candidate.patch, verify.mjs, verification.json).

Harness: main at `8f9a0064c65d9b127ecc24f675ff1d7daf306661` plus the recorded sequential Docker Bash fix and regression test. No live-run edits to the harness. Task: more-itertools v10.1.0, base commit recorded in `fixture-commit.txt`, adding keyword-only `strict=False` to batched across implementation, type declarations, tests and documentation. Driver initially inspected v10.2.0 and discovered this feature already existed; the child received only v10.1.0, no newer implementation or gold patch. This is a selected historical enhancement, not blinded novel work.

Requested model `9-router/glm-5.3`, thinking off, output limit 8192. No upstream response-model identity was present in inspected child message metadata. One fresh child, 24 investigation turns allowed, 480-second child timeout, 600-second wall safeguard per parent phase. Soft $2 guidance; no cumulative-token cutoff. No parent/runner retry; shipped child provider retry policy unchanged. Parent tools: scope only, so evidence retrieval was constrained rather than a voluntary preference over rereading source.

Docker image: `sha256:caf3ef82cd1d4ebd1724ed8374c8b2d8f1396bfab80c024489006d6093b19ad3`. Python 3.11.5; no real Python 3.12/3.13 run. No network in guest, no host mounts or automatic promotion.

## Results

- Baseline independently passed 741 tests (one skipped).
- Child scope `sc_ce863eb11b` completed, runtime disposed. Four changed files: recipes.py, recipes.pyi, test_recipes.py, versions.rst. Candidate: 119 additions, two deletions.
- Retained patch was 6204 bytes / 184 lines. Parent successfully paged through evidence to retrieve the complete patch despite the immediate Bash output's 6000-byte tail truncation.
- Follow-up retrieved before/after checks and explained native/fallback behavior without another child or command execution.
- Independent verifier imported a fresh original snapshot into a new Docker container, demonstrated its own check failed before the patch, applied the extracted patch with `git apply --check` and `git apply`, then passed 751 tests (one skipped).
- Driver checks also passed exhaustive input lengths 0–20 and batch sizes 1–7, strict/default behavior, invalid sizes, empty input, lazy consumption and keyword-only argument enforcement, both fallback and simulated Python 3.12 native availability.
- Runner SHA checks confirmed all tracked original input files unchanged. No labelled runtime containers remained after independent verification.

## Cost and context

Combined parent-plus-child catalogue estimate **$1.444**, not verified billing. Parent session usage already includes child usage; not added twice. Uncached input 128,537; cache-read 388,480; cache-write 0; output 24,283. Input cache ratio **75.1%**. Two inference phases took 683,811 ms (11m24s), excluding independent verification. Final parent context 19,690 tokens; no comparative context-saving claim follows from this single run.

## Quality and agent-experience observations

The implementation passed independent behavioral checks. However, the docstring still says batching produces lists (existing wording contradicting tuple output) and calls the Python 3.12+ implementation an alias despite the new strict fallback. The patch needs documentation polish before upstream submission. The native-path tests simulate availability; actual supported-version testing and lint/type checks remain unperformed.

The child performed 30 Bash calls plus its return, including avoidable exploration and a corrected mistaken test selector. Patch preservation required creating a temporary Git repository because the isolated snapshot intentionally excludes Git metadata. That succeeded, but is cumbersome for agents. Retained evidence paging worked, including output just beyond the immediate display limit; it did not independently establish correctness until the driver replayed the patch.

Recommendation: keep the current Bash-based interface. Next development target should be reliable, bounded patch/artifact capture at scope completion, with clear retained references and no automatic application. Do not add broader orchestration or more toy tests to address an artifact-handoff problem. Any such export must retain path/size validation and treat exported content as untrusted.
