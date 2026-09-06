# GLM retained-evidence usability check — 2026-09-06

## Result

**Correct retrieval with no work replay; pagination was unnecessarily chatty.**

`zai/glm-5.3-flash`, thinking off, correctly reported the exact alias map, recorded failure, verification token, and command from evidence item 11. It followed the capsule hint and returned continuation calls without invalid requests or new investigation.

This was a synthetic fixture, not a real Django test execution or SWE-bench run. Twelve recorded work-tool items were seeded into the test session; the target record was on the second index page, with its answer after diagnostic padding on output page four. No task commands were executed to construct the fixture. The expected answer was kept in the runner/preregistration, not the model prompt; only tool retrieval exposed it to the model.

## Measurements

- Estimated cost: **$0.000509445** (catalogue equivalent, not an invoice).
- Uncached input: **3,409**; cache-read input: **11,968**; cache-write input: **0**; output: **297** tokens.
- Input cache-hit rate: **77.8%**.
- Elapsed: **36.8 seconds**; final parent context: **3,310 tokens**.
- Six tool calls: inspect pages 1–2, then item 11 read pages 1–4.
- No forks, command execution, failed tool calls, provider errors, paid retries, or token cutoff.
- $0.10 soft cost guidance, 180-second wall timeout, max output 4,096 tokens. Pricing recorded at launch: input $0.075/M, output $0.25/M, cache-read $0.015/M.

The final answer correctly cited item 11 and stated this was recorded historical output, not fresh execution. It identified `{'T4': 'T5', 'T5': 'T6'}`, `1 failed`, `cedar-47`, and `pytest tests/test_alias_collision.py -q`.

## Agent-experience conclusion

The action names, capsule hint, item numbering, and continuation calls were usable by this model without repair. The test also exposed an avoidable interaction cost: 1,000 Unicode-code-point pages use only about 1 KiB for ASCII text despite an 8 KiB response allowance. Four read calls were needed for a roughly 3.7 KiB record.

Recommended next refinement: use a Unicode-safe **byte-based output page** that fills more of the existing allowance, preserving provenance and exact continuation calls. Do not enlarge the overall response limit or add search/model summarization yet. This should be verified with local paging tests first; this single run does not establish general usability or production cost savings.

## Evidence

Local artifacts: `/Users/davidus-tranus/Github/pi-scopes-evals/retrieval-usability-20260906T151748Z/`.

Includes frozen runner/preregistration, source hashes/snapshot, synthetic scope records, native session, events, answer, usage, and verification.json. Source and runner hashes matched after inference. A pre-inference prerequisite check found Jiti nested under pi-coding-agent rather than repo-root node_modules; the import was corrected before runner execution, as recorded in setup-note.txt. No model request or paid retry occurred during that setup correction.
