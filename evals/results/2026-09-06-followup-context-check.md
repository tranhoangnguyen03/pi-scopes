# Three-phase retained-context check — 2026-09-06

## Outcome

**Task resolved; follow-up answered with zero tool calls. Handoff quality was mixed.**

One Terra/high session investigated with one bounded child, implemented the fix, then answered a previously unrevealed follow-up about alias safety, OR operand ordering, and the distinction between child evidence and parent verification. The official SWE-bench grader resolved `django__django-15128` (1/1, no infrastructure failures/errors).

| Metric | Result |
|---|---:|
| Combined catalogue-equivalent estimate | $0.70034 |
| Child estimate (included above) | $0.39986 |
| Follow-up incremental estimate | $0.01968 |
| Uncached input | 186,710 tokens |
| Cache-read input | 642,560 tokens |
| Cache-write input | 0 tokens |
| Output | 16,534 tokens |
| Input cache-hit rate | 77.5% |
| Whole session | 421.9 seconds |
| Peak/final parent context | 35,814 tokens |
| Parent compactions | 0 |
| Follow-up work-tool calls | 0 |

Dollar figures are catalogue estimates, not OAuth invoices. No cumulative-token cutoff was used. $1.50 was soft guidance; the 15-minute overall timeout remained. No retries, extra children, or post-run patch repair.

## What the evidence supports

The follow-up correctly explained that removing the disjoint-alias assertion would permit destructive in-place alias renaming, and that reversing operands changes alias allocation without demonstrating different result-set semantics. It correctly distinguished the child's reported reproduction from the parent's later passing regression tests, and noted that the capsule omitted a test command and result-set-equivalence evidence.

Actual parent tool results confirm `Queries4Tests` ran 20 passing tests, and the focused pair ran two passing tests. Compilation and diff checks also passed. The official patch includes reserved-alias allocation through `combine`/`join`/`table_alias` and an empty-result regression; that does not prove equivalence on populated data or exhaustive correctness.

The final follow-up reused retained conversation without reads, searches, or test reruns. This demonstrates ordinary within-session reuse, **not** recovery after compaction, comparative context savings, or retrieval from stored traces: no compaction occurred and there was no baseline.

## Handoff weakness

The child returned `partial` after eight investigation turns and one return call (usage counts an additional zero-token aborted assistant record). The full trace confirms an actual reproduction: it printed the overlapping `{'T4': 'T5', 'T5': 'T6'}` map, forward `AssertionError`, and successful reverse SQL construction. It also ran an existing test successfully.

But its capsule omitted the concrete reproduction output and test command, and included a stray `conclusions:[` string. The return arguments contained extraneous punctuation-named fields; the stored semantic capsule did not include those fields. The accepted structure was not a guarantee of useful completeness.

The parent used `scope inspect`, then did **8 reads, 3 greps, 1 find, and 6 bash calls** during the investigation phase after delegation, including two incorrect test selectors before a successful one. This is substantial additional investigation, even though some source verification was appropriate. The phase-1 summary combined child claims and parent checks; the final follow-up distinguished them more carefully.

Thus the final follow-up result is encouraging, but the run is not evidence that the capsule alone eliminated repeated investigation. Total cost should be judged alongside both the resolved patch and that redundancy.

## Next direction

No more Terra tests are planned. Per owner instruction, future test models are `zai/glm-5.3-flash` or `zai/glm-5.3`; verify availability/pricing before launch and record the selected model. Do not silently substitute Terra/Codex.

This run gives a concrete reason to consider bounded evidence retrieval through the existing `scope` tool: useful reproduction evidence existed in the trace but not in the capsule. Keep that proposal small; do not add a new messaging system or promise semantic completeness from schema validation.

## Reproduction record

Raw root: `/Users/davidus-tranus/Github/pi-scopes-evals/followup-check-20260906T143007Z/`.

Contains frozen preregistration/prompts, runner and source hashes, exact source snapshot, native session, phase outputs, context samples, child traces/capsule, exact solution patch, prediction, grade log/report, and verification.json. Base `cb383753c0e0eb52306e1024d32a782549c27e61`; Pi 0.85.1; Terra/high; one child limited to eight investigation plus at most two return turns. Full public reproduction was appended to the handoff. Product source remained unchanged during inference/grading.
