# Reviewed experimental checkpoint

Owner requested review and a local Git checkpoint, then reorientation. No push/publication authorized.

## Scope

Accumulates sequential isolated Bash scheduling; bounded automatic Docker text patches; retained patch evidence/result/UI integration; source manifest; tests and live evaluation reports; packaged documentation and clean-install instructions. Package stays private, version 0.1.0-experimental.0.

## Review disposition

AGY read-only review completed: `run_36c08556ec1342ada86b323bffbb409d`. Reviewer reported no critical blocker, but identified missing unavailable-patch evidence on cancellation. Driver reproduced with three failing cases, then fixed the shared evidence reader to use saved result metadata when no capture trace exists. This also covers pre-capture failures/reopen results without adding synthetic persistent trace events. Real-Docker cancellation regression verifies inspect/read after disposal.

Other comments: the 2 MiB ignore-command output limit can reject unusually large ignored path sets; retained as an explicit bounded failure rather than expanded speculatively. Node stream.end buffers the already bounded input; no unbounded producer was identified. Documentation now records this secondary cap. Evaluation reports are deliberately included and tracked in this checkpoint; npm packing a dirty tree is not claimed reproducible. No optimization of the accepted single-hunk representation.

Review is not a hostile-code audit or certification. Existing trusted-host, guest-race, ASCII/UTF-8 and binary limitations remain.

## Verification

Fresh full suite with pinned real Docker image: 125 tests pass across ten files. TypeScript, diff checks and pack dry-run pass. Existing paid acceptance remains frozen: automatic captured patch independently applied and 748 upstream tests passed, approximately $1.84. No new paid inference during checkpoint review. Prior isolated install tested the actual package tarball and registration on this macOS/Node24 host; not universal compatibility.

## Reorientation

Stop feature expansion for this checkpoint. Use the experimental package on ordinary work and record actual blockers (especially clean-input/dependency setup, result reliability and review handoff). Compact diffs remain deferred until recurring retrieval costs or cap failures justify them. Public release still needs broader platform/install/security review and a deliberate publication decision; automatic promotion remains a separately designed boundary.
