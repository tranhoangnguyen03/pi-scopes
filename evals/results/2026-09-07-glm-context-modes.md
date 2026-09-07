# GLM context-mode usability check — 2026-09-07

**Result:** two synthetic tasks, two correct answers, expected context modes selected without specifying the mode in the task prompt. This supports checkpointing the interface, not a broad effectiveness or context-saving claim.

## Setup and preserved evidence

- Model: `zai/glm-5.3-flash`, requested thinking `off`; parent and child use the same model. Provider-normalized child usage nevertheless reports reasoning tokens; these are not added again to output.
- Pi 0.85.1; current uncommitted context-mode source over checkpoint `fb4c7f35aee3d26db39dc7d3860650193500ae9a`.
- Artifact root: `/Users/davidus-tranus/Github/pi-scopes-evals/context-modes-20260907T062719Z`.
- `run.mjs`, pre-inference `preregistration.json`, complete tracked/untracked source copies and hashes, Git state/patch, per-case parent events/session, retained scope traces/capsules, answers and usage are preserved there. `verify.py` is a post-run, inference-free check; `verification.json` records its passing result.
- Separate fixture workspaces and parent sessions. Parent has only `scope`; children have the shipped work tools and `scope_return`. This is trusted-host execution, not a sandbox.
- Each prompt requests one delegation with four investigation turns and a 90-second child timeout; a parent hook prevents a second child. Per-case outer timeout: 150 seconds. Soft dollar guidance: $0.10/case, no cumulative-token cutoff. Maximum output per response: 4,096 tokens.
- No experiment or parent retry. The shipped child executor still permits one provider retry; neither run reported an error or timeout.
- Expected answers are saved in the registration, not supplied to the model. The model sees a six-row CSV through child tools. Delegation itself is explicitly requested; autonomous decisions about *whether* to delegate are not tested.

## Observations

| Case | Mode selected | Result | Child work |
| --- | --- | --- | --- |
| Independent measurement audit | `fresh` | Correct: api=260, search=220, preview=900, worker=205; six rows examined | One `read`, then valid `scope_return` |
| Previously agreed rollout rules | `fork` | Correct: api and worker blocked, label `amber-gate`; strict threshold and canary exclusions respected | One Bash read, then valid `scope_return` |

Fresh mode loaded fixture `AGENTS.md` by default and included its requested `measured-only` evidence label. The unrelated prior-conversation marker did not appear in the fresh child trace. Fork metadata records the inherited parent session/entry and effective-instruction path. Neither fixture changed. Both children completed in two turns, with no return repair or evidence-retrieval follow-up.

**Important limitation:** the fork caller chose the expected mode but also repeated the earlier rules and label in its goal. Consequently, correct output cannot establish that inherited context was necessary or better than a self-contained fresh goal. Local scripted-provider tests remain the evidence for exact history visibility, invocation-batch exclusion and historical-usage accounting. We did not retry or tailor the prompt to force a more favorable demonstration.

## Combined parent-plus-child usage

Pi parent totals already include nested child usage; capsule usage is not added again.

| Case | Estimated dollars | Uncached input | Cache-read input | Cache-write input | Output | Input cache-hit rate | Wall time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Independent | $0.000539975 | 4,299 | 3,520 | 0 | 659 | 45.0% | 25.6 s |
| Conversation-dependent | $0.000648780 | 5,634 | 2,432 | 0 | 759 | 30.2% | 27.8 s |
| Total | **$0.001188755** | **9,933** | **5,952** | **0** | **1,418** | **37.5%** | **53.4 s** |

Pricing is the selected Pi model catalogue: per million tokens, input $0.075, cache read $0.015, output $0.25, cache write $0. These are best-effort catalogue estimates, not a billing invoice. The post-run verifier independently recomputes cost from normalized token fields. Cache-hit rate is cache-read divided by uncached + cache-read + cache-write input. These tiny, different tasks do not support comparing the efficiency of the two modes.

## Decision

Checkpoint the tested `run`/`context` interface. No source fix was required by these observations. Next development priority is the enforceable isolation design for public use, not more repetitions of this easy fixture. Long-history context quality, difficult-task effectiveness and comparative savings remain unproven.
