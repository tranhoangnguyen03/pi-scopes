# Experimental checkpoint — 2026-09-07

**Milestone: usable opt-in Docker delegation, with fresh/fork context and retained evidence.** Package remains private `0.1.0-experimental.0`; this is not a registry release or security certification.

## What works now

- One foreground, same-model child; Pi 0.85.1 in-process sessions/callbacks, no socket/intercom service.
- `scope({action:"run", context:"fresh"|"fork", goal})`. Fresh defaults to applicable project guidance; fork inherits the active conversation snapshot/effective instructions, not parent tools or permission hooks.
- **Host execution remains the default and is unrestricted.** Owner environment can select **Docker-copy execution**; the model cannot choose host fallback.
- Docker receives a clean committed project copy under `/workspace`, not a mount of the parent checkout. All child file/command work uses isolated Bash; host-backed file tools are absent. Both fresh and fork are tested through the real SDK.
- Child edits affect only the copy. No network or automatic promotion. A bounded workspace text patch is captured automatically before disposal and exposed through existing inspect/read; other findings survive as command output and capsules. Guest paths alone are not durable artifacts.
- Default eight investigation turns, up to two return-only turns, explicit partial outcomes, cancellation and combined parent/child usage accounting.
- Parent can inspect/read bounded retained evidence after container and scratch cleanup. Owned Docker output blobs preserve raw capture plus exit/failure metadata without SDK host temporary files.
- Container identity is persisted before creation. Verified cleanup precedes normal return. Cleanup failure is visible, blocks new launches and is reconciled on session reload/reopen rather than silently relabelled disposed.

[Configuration and usage](../README.md#optional-isolated-execution) · [Exact contract](v0.1-contract.md#docker-copy-execution) · [Implementation record](plans/2026-09-07-isolated-delegation.md)

## Reviewed local checkpoint

[Review and disposition](plans/2026-09-07-reviewed-checkpoint.md): AGY read-only review completed; driver reproduced and fixed missing cancellation patch metadata in evidence inspection. Fresh full Docker-enabled suite: **125 passed**, plus TypeScript, diff and packaging checks. No new paid inference, publication or push. Compact diffs remain deferred; next use is ordinary experimental work rather than another feature cycle.

## Latest patch-capture verification

- **122 tests passed** across ten files with Docker enabled; default invocation passed **91 with 31 explicit skips**. TypeScript, diff checks and package dry-run passed; no labelled containers remained.
- Covers automatic add/edit/delete/empty-file/mode capture, independent application inside Docker, durable evidence reading after cleanup, unsafe/malformed archives, size caps, storage failure and cancellation. Live automatic-capture acceptance also passed independent patch application and 748 library tests; [report](../evals/results/2026-09-07-glm-automatic-patch-acceptance.md). The 75 KB / 13-page patch exposed an ergonomic limit in single-hunk diff generation.
- The aborted/timed-out AGY implementation left partial code; owner approved direct takeover. Driver replaced permissive tar parsing and quadratic diff storage, fixed success-on-capture-error, and verified the resulting implementation. No claim of successful external review.
- Deliberate boundaries: portable ASCII paths/ustar, UTF-8 text changes only, 4 MiB patch and bounded export. New ignored files excluded under original checkout rules; tracked changes never ignored. No atomic snapshot guarantee against background guest writers. See contract for exact limits.
- Previous live real-library task passed independent verification with manual patch capture: [report](../evals/results/2026-09-07-glm-real-library-docker.md). That result motivated this change; it is not acceptance evidence for the new capture code.

## Clean-install readiness check

The actual npm tarball was installed into a fresh temporary consumer with dependencies (lifecycle scripts disabled), then registered using Pi 0.85.1 `pi install` with a separate `PI_CODING_AGENT_DIR`. A fresh SDK resource loader discovered exactly one extension, the `scope` tool and `/scope` command, with zero load errors. It used no development-checkout imports, model credentials or paid inference and did not change personal Pi settings. Tarball documentation omissions were fixed; README now explains dependency installation, removal, context versus authority, and first-use expectations.

Artifacts: `../pi-scopes-evals/clean-install-20260907/` contains the tested tarball, pack manifest, smoke output/script and consumer dependency lock. This proves package installation/registration on this macOS/Node 24 host, not a new fresh-install end-to-end child run, native-Linux acceptance or public security review. Fresh source checks: TypeScript and diff checks pass; default suite 91 pass / 31 Docker skips. Docker runtime code was unchanged in this packaging scope.

## Previous Docker checkpoint verification

- **91 tests passed** with real Docker cases enabled, across nine files. This includes 37 real-Pi/scripted-provider integration cases, ten of them exercising Docker delegation; fourteen runner tests include twelve real-runtime cases.
- TypeScript, `git diff --check` and package dry-run passed; the packaged source includes the snapshot importer and isolated Bash adapter.
- Docker Desktop **29.4.0** on macOS, Linux/aarch64 daemon, existing Linux/amd64 fixture image `sha256:caf3ef82cd1d4ebd1724ed8374c8b2d8f1396bfab80c024489006d6093b19ad3` under emulation. No image pull/build or paid inference was needed for implementation checks. No labelled test containers remained.
- Default tests passed **69 checks with 22 explicit skips**: real-runtime cases require `PI_SCOPES_TEST_DOCKER_IMAGE`. These are mechanics/boundary checks, not new model-effectiveness evidence or native-Linux validation.

Static AGY review did not run commands. Regressions addressed cleanup state, deleted input, empty nested cwd and evidence outcome visibility. Driver investigation independently reproduced **Git clean-filter execution during `git status`**, then replaced that check with plumbing/index metadata and literal byte comparison. Docker import was also tested against read-only rootfs: ordinary `docker cp` failed, so import now streams an owned archive to the unprivileged guest without weakening the boundary. See the implementation record for remaining coverage gaps.

Dependencies are unchanged. The prior September 6 checkpoint had a clean install and zero reported audit vulnerabilities; that historical audit is not a new security audit of this feature.

## Practical limits

- Docker input must match committed literal bytes: no dirty/non-ignored untracked changes, symlinks or submodules; maximum 12 MiB / 10,000 regular files. Ignored files and `.git` are excluded. Filters/line-ending conversions may cause otherwise Git-clean working files to be refused.
- A committed secret or secret already in forked context is still disclosed to the child/model. No secret redaction or prompt-injection-proof conclusions.
- Image and Docker CLI/daemon are trusted; image must already contain Bash, GNU tar and task dependencies. No automatic dependency installation or host fallback.
- Experimental limits: 256 MiB memory, one CPU, 64 PIDs, 16 MiB each guest workspace/tmp; work output 1 MiB per command / 8 MiB per scope. These are resource-safety limits, not inference-spend cutoffs. Total model/event trace loading remains in-memory and is not bounded by the output cap.
- No independent crash-time watchdog. An interrupted host or ambiguous daemon failure may leave a container until reconciliation. Container/kernel exploits, comprehensive egress/resource stress and native-Linux behavior have not been certified. Use monitored experimental workloads, not unattended hostile jobs.
- No recursive/parallel/background children, arbitrary file export or automatic merge, cross-session retrieval, semantic evidence search, or live child recovery.

## Effectiveness evidence so far

[Evaluation policy and reports](../evals/README.md) preserve the frozen historical experiments:

- Easy paired SWE-bench pilot: both arms resolved; lower final parent context with scopes, but higher time/estimated cost.
- Harder study exposed unbounded investigations failing to return useful results; this motivated turn-bounded investigation.
- Bounded Django check resolved at approximately $0.396 combined estimate. Three-phase follow-up resolved at approximately $0.700, but weak capsules caused initial repeated investigation.
- GLM retrieval fixture recovered evidence without replay for approximately $0.00051. Two context-mode fixtures selected expected modes and answered correctly for approximately $0.00119; no causal inheritance advantage was established.
- Owner-authorized DeepSeek real-task design observation completed for approximately $0.01143 with 83.0% cached input. Follow-ups reused evidence without reopening source, but initial re-investigation and material factual errors remained. The driver corrected those errors before implementation.

These selected observations do not establish consistent superiority, comparative dollar savings or correctness of model conclusions. A `completed` capsule is not an independent verification badge. Context preservation can preserve mistakes too.

Owner policy remains output quality versus best-effort combined dollars, with uncached/cache-read/cache-write input and output breakdowns. Spending guidance is soft; no cumulative-token cutoff. Future paid test defaults remain GLM 5.3 Flash/GLM 5.3 unless the owner explicitly authorizes another model.

## Next meaningful work

1. Review/checkpoint and clean-install registration are complete locally. Use this baseline on ordinary work, collecting concrete blockers before selecting more development. No publication or push implied.
2. Use the experimental package on actual work; prioritize recurring blockers rather than optimizing one selected run. Avoid automatic promotion until its separate trust boundary is designed/tested.
3. Before public recommendation: native-Linux/macOS compatibility, adversarial runtime review and clear unattended-use limits.

## Deferred optimization: compact patches

Owner decision: defer compact multi-hunk diffs. Automatic capture passed; the 75 KB / 13-page patch is an observed inefficiency, not a functional blocker. Revisit when repeated real tasks show material retrieval cost/context pressure, or inflated patches hit the 4 MiB cap on otherwise reasonable changes. Preserve strict capture limits and failure semantics; do not compensate by adding tools or increasing context allowances. See the frozen [acceptance report](../evals/results/2026-09-07-glm-automatic-patch-acceptance.md) for evidence; its then-current next-step recommendation is superseded by this decision.
