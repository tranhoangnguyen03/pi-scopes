# Documentation map

## Active direction

- [Product and release design](product-release-design.md): the owner's npm/VM experience, proposed decisions and release criteria.
- [Release implementation plan](plans/2026-09-07-npm-vm-release.md): ordered work and validation gates. **This is the active plan.**
- [Current implementation status](STATUS.md): what exists and has actually been verified.
- [Implementation contract](v0.1-contract.md): current behavior and limitations, not promises of future functionality.
- [User guide](../README.md): installation and current use.

If plans and implementation differ, the contract/status describe current behavior; the release design describes the intended destination. Do not present planned diagnostics or compatibility support as shipped.

## Historical archive (preserved in place)

The following plans are historical records, not queued work. Paths are retained so links and experiment references remain valid:

- [Bounded investigation](plans/2026-09-05-bounded-investigation.md)
- [Evidence retrieval](plans/2026-09-06-evidence-retrieval.md)
- [Fresh/fork contexts](plans/2026-09-06-context-modes.md)
- [Sandbox boundary proposal](plans/2026-09-07-sandbox-boundary-proposal.md)
- [Docker runner](plans/2026-09-07-docker-command-runner.md)
- [Isolated delegation](plans/2026-09-07-isolated-delegation.md)
- [Reviewed checkpoint](plans/2026-09-07-reviewed-checkpoint.md), implementation commit `a2cab01`.

[Evaluation reports](../evals/README.md) are observations of particular versions, not current acceptance claims. Frozen reports and external run artifacts must not be rewritten to match the current roadmap. Later decisions supersede old recommendations without erasing evidence.

## Deferred, not silently promised

Compact multi-hunk patches: revisit only for recurring cost/context pressure or otherwise reasonable changes hitting the retention cap. Parallel/recursive/background children, automatic promotion, arbitrary child extension inheritance and a messaging service are not prerequisites of the initial release. See the design for separate decisions that may become necessary.
