# Experimental checkpoint — 2026-09-07

**Milestone: fresh/fork context modes + bounded investigation + retained evidence retrieval.** This is a tested research prototype, not a sandbox or a broadly validated production release. Package version remains `0.1.0-experimental.0` (private); no publication is implied.

## Working behavior

- Pi 0.85.1; parent/child communication stays in-process. No socket-server or intercom dependency.
- One foreground same-model child in a shared host workspace, with fresh delegation (default) or forked parent context.
- Self-contained handoff guidance; default eight investigation turns, then at most two return-only turns. Explicit partial findings, cancellation, trace retention, scratch cleanup and combined usage accounting.
- Bounded result capsules with provenance and evidence-inspection hints.
- Existing `scope` tool lists scopes, inspects numbered tool records, and reads retained output. No command replay or model invocation for retrieval. Missing or ambiguous evidence is not invented.
- Evidence output pages now use up to 6,000 UTF-8 bytes while keeping whole code points and the full response within 8 KiB. This replaces the small character pages used in the initial GLM check; no paid effectiveness improvement is claimed for that refinement.

## Local verification

- Fresh context-mode checkpoint checks: `npm test` **54 tests passed** across seven files, including 26 real-Pi/scripted-provider integration cases.
- At the previous September 6 checkpoint, clean `npm ci` completed; dependency deprecation warnings for `node-domexception` remain upstream.
- `npm run check`: TypeScript passed.
- Previous September 6 checkpoint: `npm audit` reported zero vulnerabilities; dependencies are unchanged in this slice.
- `npm pack --dry-run`: extension source, including context helpers and evidence retrieval, present; not a registry publication or end-user deployment test.
- `git diff --check`: passed before checkpoint.

The AGY retrieval review identified pairing, fallback and command-recovery issues that were addressed with regression checks. Its sandbox could not perform local-HTTP integration validation (`connect EPERM`); those tests were verified in the primary checkout, not claimed as an independent reviewer pass.

## Effectiveness evidence

See [evaluation policy and reports](../evals/README.md).

- Easy paired pilot: both arms resolved; scopes reduced final parent context at higher time/estimated cost.
- Harder study: unbounded children exhausted the experiment's former token allowance without useful returns; this motivated bounded investigation.
- Bounded Django check: useful partial return and officially resolved parent patch, approximately $0.396 combined catalogue-equivalent cost.
- Three-phase Django check: task resolved and final follow-up needed no tools, approximately $0.700; weak capsule evidence still caused earlier parent re-investigation.
- GLM Flash synthetic retrieval check: correct facts, no work replay, approximately $0.00051; navigation succeeded but small pages caused avoidable calls.
- [GLM Flash context-mode check](../evals/results/2026-09-07-glm-context-modes.md): two correct synthetic answers, expected fresh/fork selections, approximately $0.00119 combined. Fork also restated background in the goal: interface usability evidence, not proof of inheritance benefit.

These are small, selected checks, not evidence of consistent superiority, post-compaction recovery, or general cost savings. Historical raw runs remain unchanged outside the repository; reports link their local artifact directories.

Current owner policy: judge output quality against best-effort combined dollar estimates, with uncached/cached input and output breakdowns. Spending guidance is soft; no future cumulative-token cutoff. Future paid test models are `zai/glm-5.3-flash` or `zai/glm-5.3`, subject to availability and explicitly recorded settings.

## Owner decision: host prototype now, enforced isolation later

Keep current host execution enabled for prototyping speed (option A). Do not add a consent gate or model-facing permission-tier controls now. This is a deliberate trusted-host mode: children do not inherit parent permission hooks, and a separate worktree would not change that security boundary.

The intended audience includes other users. The later target is enforced sandbox isolation (option C), not consent alone. Before describing execution as isolated, specify and test filesystem/mount access, credentials, network/process access, resource limits, and any patch-promotion boundary. These details are not yet decided or implemented. Keep the current limitations conspicuous; the public-use target is not permission to publish the present prototype as sandboxed.

## Context-mode checkpoint

Current API: `scope({ action: "run", context: "fresh" | "fork", goal })`, with fresh as default. The old model-facing `fork` action is removed, not aliased. Both modes share bounded execution, capsules, and retrieval. Fresh mode includes project guidance by default (`repoInstructions:false` opts out); fork snapshots the active parent branch before the invoking tool batch and reuses effective instructions, without importing permission hooks or extension runtimes. Copied historical usage is excluded from child billing totals. See the [current contract](v0.1-contract.md) for exact boundaries. Historical experiment reports/runners retain the API they actually used. Local context-mode validation has **54 passing tests** plus TypeScript checks. The separate GLM observation supports basic interface usability; it does not establish difficult-task effectiveness or comparative savings.

## Next priorities

1. **Sandbox design:** define the smallest enforceable boundary suitable for use by others. Keep context choice independent of execution authority. Worktrees and reviewed patch promotion may complement isolation but cannot replace it.
2. **Release readiness:** consolidated compatibility/security review and installation checks before making a public package recommendation.
3. **Targeted effectiveness:** only test a remaining claim, such as long-history handoff quality, rather than replay successful demos. Guidance is not an access-control mechanism.

## Deliberate limits

No sandbox, parallel/recursive/background children, worktree isolation, live child recovery, semantic evidence search, cross-session retrieval, or secret redaction. Turn limits are not token/cost caps; a hard timeout may still prevent a useful return. Retained records are historical and may be stale. Trace/blob loading is in-memory despite bounded response pages. Corrupt storage may surface errors rather than being repaired.

**Checkpoint meaning:** preserve the complete tested milestone in Git so further trust-boundary work has a stable starting point. It is not permission to publish, push, or expand the roadmap.
