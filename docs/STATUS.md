# Experimental checkpoint — 2026-09-06

**Milestone: bounded investigation + retained evidence retrieval.** This is a tested research prototype, not a sandbox or a broadly validated production release. Package version remains `0.1.0-experimental.0` (private); no publication is implied.

## Working behavior

- Pi 0.85.1; parent/child communication stays in-process. No socket-server or intercom dependency.
- One foreground same-model child, fresh conversation, shared host workspace.
- Self-contained handoff guidance; default eight investigation turns, then at most two return-only turns. Explicit partial findings, cancellation, trace retention, scratch cleanup and combined usage accounting.
- Bounded result capsules with provenance and evidence-inspection hints.
- Existing `scope` tool lists scopes, inspects numbered tool records, and reads retained output. No command replay or model invocation for retrieval. Missing or ambiguous evidence is not invented.
- Evidence output pages now use up to 6,000 UTF-8 bytes while keeping whole code points and the full response within 8 KiB. This replaces the small character pages used in the initial GLM check; no paid effectiveness improvement is claimed for that refinement.

## Fresh local verification

- Clean `npm ci` completed; dependency deprecation warnings for `node-domexception` remain upstream.
- `npm test`: **46 tests passed** across six files, including 21 real-Pi/scripted-provider integration cases.
- `npm run check`: TypeScript passed.
- `npm audit`: zero reported vulnerabilities at checkpoint time.
- `npm pack --dry-run`: extension source, including evidence retrieval, present; not a registry publication or end-user deployment test.
- `git diff --check`: passed before checkpoint.

The AGY retrieval review identified pairing, fallback and command-recovery issues that were addressed with regression checks. Its sandbox could not perform local-HTTP integration validation (`connect EPERM`); those tests were verified in the primary checkout, not claimed as an independent reviewer pass.

## Effectiveness evidence

See [evaluation policy and reports](../evals/README.md).

- Easy paired pilot: both arms resolved; scopes reduced final parent context at higher time/estimated cost.
- Harder study: unbounded children exhausted the experiment's former token allowance without useful returns; this motivated bounded investigation.
- Bounded Django check: useful partial return and officially resolved parent patch, approximately $0.396 combined catalogue-equivalent cost.
- Three-phase Django check: task resolved and final follow-up needed no tools, approximately $0.700; weak capsule evidence still caused earlier parent re-investigation.
- GLM Flash synthetic retrieval check: correct facts, no work replay, approximately $0.00051; navigation succeeded but small pages caused avoidable calls.

These are small, selected checks, not evidence of consistent superiority, post-compaction recovery, or general cost savings. Historical raw runs remain unchanged outside the repository; reports link their local artifact directories.

Current owner policy: judge output quality against best-effort combined dollar estimates, with uncached/cached input and output breakdowns. Spending guidance is soft; no future cumulative-token cutoff. Future paid test models are `zai/glm-5.3-flash` or `zai/glm-5.3`, subject to availability and explicitly recorded settings.

## Next priorities

1. **Trust contract:** children currently do not inherit parent permission hooks; host `bash` is unrestricted. Decide and enforce safe integration behavior before broader recommendation.
2. **Repository guidance:** choose explicit, narrow instruction inheritance without importing the whole parent conversation or unrelated extension catalogue.
3. **Release readiness:** consolidated compatibility/security review and installation checks before making a public package recommendation.
4. Only then consider another small effectiveness check, focused on the remaining claim rather than replaying successful demos.

## Deliberate limits

No sandbox, parallel/recursive/background children, worktree isolation, live child recovery, semantic evidence search, cross-session retrieval, or secret redaction. Turn limits are not token/cost caps; a hard timeout may still prevent a useful return. Retained records are historical and may be stale. Trace/blob loading is in-memory despite bounded response pages. Corrupt storage may surface errors rather than being repaired.

**Checkpoint meaning:** preserve the complete tested milestone in Git so further trust-boundary work has a stable starting point. It is not permission to publish, push, or expand the roadmap.
