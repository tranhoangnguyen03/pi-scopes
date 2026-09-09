# Automatic Docker patch capture — live acceptance

## Verdict

Functional acceptance passed on a real-library task. The child made four-file changes without manual backups/diff construction; the harness retained an applicable patch, the parent retrieved all pages after disposal, and an independent fresh Docker verifier passed the expanded suite and driver checks. Ergonomic acceptance is mixed: the linear single-hunk diff expanded unchanged intervening text, making patch retrieval unnecessarily expensive.

## Provenance and protocol

Artifacts: `../pi-scopes-evals/automatic-patch-live-20260907T150333Z/`, including `run.mjs`, preregistration, complete source snapshot/hashes (including untracked implementation files), source diff, Git state, original workspace, baseline, phases/session, scope records/traces/blobs, `candidate.patch`, `verify.mjs`, and `verification.json`.

Harness: main at `8f9a0064c65d9b127ecc24f675ff1d7daf306661` plus recorded uncommitted automatic-capture implementation. Source was snapshotted before inference. Input: more-itertools v10.1.0, `266ebdcf9027b7bb6ab72f8cd4585804c1e1547e`. Repeated strict-batching enhancement from the earlier manual-capture evaluation, but a fresh parent/child session with no earlier solution artifacts. Driver knows the feature exists upstream; no gold implementation supplied. Selected acceptance task, not a blinded or controlled benchmark.

Owner authorized `9-router/glm-5.3`; thinking off, max output 8192, one fresh child, max 24 investigation turns, 480-second child timeout, 600-second wall safeguard per parent phase. Soft $2 guidance, no cumulative-token cutoff. No parent/runner retry; shipped child retry policy unchanged. No upstream response-model identifier appeared in inspected child message metadata, so upstream model identity is not independently established.

Same pinned local Docker image as previous check: `sha256:caf3ef82cd1d4ebd1724ed8374c8b2d8f1396bfab80c024489006d6093b19ad3`. Guest network off, no host mounts. Parent had scope only; follow-up retrieval was requested, not a voluntary preference over source rereading.

## Results

- Independent original baseline: 741 tests, OK (one skipped).
- Scope `sc_541fe1939e`: completed, patch captured, runtime disposed.
- Four files: `docs/versions.rst`, `more_itertools/recipes.py`, `more_itertools/recipes.pyi`, `tests/test_recipes.py`.
- 35 child Bash calls; inspected commands contained no backup/copy-original/manual-diff work. The harness—not a model-printed diff—provided the patch.
- Owned patch blob: `blob://01a07c65-d60f-70dc-aaef-9cd427bc6d56/sc_541fe1939e-50daccd5-e496-4f4f-9600-dd8253a5e1a8.log`.
- Retained patch: 75,555 bytes, reported +1194/-1021. Counts include unchanged intervening lines represented as deletion/addition by the single-hunk implementation; they are not a measure of semantic work.
- Parent follow-up: four index pages, then all 13 pages of patch item 36 plus verification evidence. 26 follow-up tool calls total; no new child or command execution.
- Independent verifier extracted the exact capsule-referenced blob, checked expected file paths, imported a fresh original copy into a new Docker runtime, and demonstrated its own check failed before patching. `git apply --check` and actual application succeeded. Afterwards, 748 tests passed (one skipped).
- Independent driver checks passed lengths 0–20 / batch sizes 1–7, strict/default behavior, lazy consumption, empty inputs, invalid sizes, keyword-only enforcement, and fallback/simulated Python 3.12 native paths.
- Runner hashes confirmed all tracked parent-input files unchanged. No labelled runtime containers remained after independent verification.

## Cost and context

Combined parent-plus-child catalogue estimate **$1.840448**, not verified billing. Uncached input 139,973; cache-read 572,416; cache-write 0; output 34,175. Input cache ratio **80.35%**. Inference phases took **660,226 ms (11m00s)**, excluding independent verification. Final parent context **43,868 tokens**. Child usage is already included in parent statistics, not added twice.

Earlier manual-capture run: approximately $1.444, final parent context 19,690, 6204-byte patch. Different generated implementations and tool behavior prevent causal dollar/context comparisons. Nevertheless, 13 pages for this task is a concrete usability cost of the current diff representation. High cache rate does not offset needless reading.

## Limits and next step

No actual Python 3.12/3.13 run; native availability is simulated. No new security certification, lint/type validation of the candidate, or public-package readiness claim. Recorded child mistakes included a test shim repair and a misused caller check; final independent behavioral verification passed. The parent also inaccurately described fallback size validation as eager-at-call despite it being inside a generator; raw evidence and verification remain more reliable than narrative conclusions.

Next: produce compact conventional multi-hunk patches through a bounded trusted mechanism, keeping existing strict path/type/size validation, complete-capture failure semantics, and no automatic application. Do not solve the inflated patch by enlarging evidence pages or adding tools. Retain this run unchanged as evidence of both functional success and the ergonomic limitation.
