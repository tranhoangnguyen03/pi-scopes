# Npm/VM Experimental Release Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Ship an owner-approved npm package that can be installed in a VM and used through normal main-agent conversation, with honest context/quality claims and actionable compatibility diagnostics.

**Architecture:** Preserve the reviewed Pi-native scope lifecycle. Add the smallest verified readiness/compatibility surface and main-agent workflow guidance; validate the packaged artifact rather than only the development checkout. No automatic extension inheritance or blind patch promotion.

**Tech Stack:** TypeScript, Pi SDK/AI 0.85.1, TypeBox, Vitest, npm, optional local Docker. No new runtime dependencies planned.

Design: [product-release-design.md](../product-release-design.md). Baseline: `a2cab01`. This plan supersedes earlier milestone plans for prioritization, not historical evidence.

---

## Stage 1 — Compatibility inventory and release decisions

**Files:** inspect `src/index.ts`, `src/child/pi-child-executor.ts`, `src/child/context.ts`, `src/core/scope-kernel.ts`, `package.json`, `test/pi-integration.test.ts`; create `docs/compatibility.md` only when verified findings exist.

1. Read the pinned Pi extension, SDK, package and provider docs and relevant source; verify supported APIs for loaded tools/providers, lifecycle and loader errors. Record missing observability rather than guessing.
2. Ask owner for target VM platform and the extension set they want tested. Do not dump personal configuration or credentials. Proposed categories: provider registration, permissions, tool-name collisions, session lifecycle, ordinary UI-only extension.
3. Produce a short matrix: observed parent behavior, child capability, diagnostic feasibility, tested version and known/unknown status.
4. Present the authority/default decision and npm naming options. Existing behavior remains unchanged pending approval. Package identity can be settled later if it does not block local checks.

**Exit:** concrete diagnostics supported by Pi APIs, a target environment, and no implied universal compatibility. If host introspection is insufficient, prefer documented loader errors and explicit readiness failures over a new discovery framework.

## Stage 2 — Readiness and actionable diagnostics

**Files:** modify `src/index.ts`, `src/child/pi-child-executor.ts`, `src/ui/format.ts` and relevant tests; create `src/core/compatibility.ts` only if logic is genuinely shared. Update `README.md`, `docs/compatibility.md`, `docs/v0.1-contract.md`.

1. Add failing scripted-provider/loader tests for the specific supported observations from Stage 1: unavailable child model/provider; missing required environment; known collision behavior; permission semantics disclosure.
2. Run targeted tests and record the expected failures: `npm test -- test/pi-integration.test.ts` (use a narrow `-t` while developing).
3. Implement concise condition/impact/remedy messages. Reuse existing command/UI surfaces; do not add an agent tool merely for diagnostics. No silent model/mode fallback or automatic configuration edits.
4. Add tests for repeated notification suppression where notifications exist, unsupported introspection, and diagnostics containing no secrets/prompts/code/path dumps. A fixture can include a canary value that must not appear.
5. Run `npm run check`, targeted tests and `git diff --check`; review actual warning text as a user would see it. Checkpoint the completed slice, not speculative scaffolding.

**Exit:** known failures are understandable and safely scoped; remaining unknowns are stated. Diagnostics are not a claim to sandbox arbitrary extensions.

## Stage 3 — Normal main-agent completion workflow

**Files:** `src/index.ts` prompt guidelines, `src/child/pi-child-executor.ts` child instructions, `src/ui/format.ts`, `test/pi-integration.test.ts`, `README.md`; record evaluations under `evals/results/` with frozen external runners.

1. Define two acceptance scenarios: a trivial task that should remain direct; a substantial coding/investigation task with follow-up evidence needs.
2. Add deterministic regressions for any actual interface change before code. Existing tests remain the mechanical baseline; they cannot prove spontaneous delegation judgment.
3. Improve guidance only where necessary: selective delegation, self-contained goals, evidence use, verification and final task completion. No mandatory delegation or prompt essay.
4. Demonstrate what happens to Docker changes: parent uses existing authorized work tools to review/apply/verify, or explicitly returns a proposal. Include dirty/diverged parent input and rejection of unsupported patch application in the scenario; no blind automatic merge implementation in this stage.
5. Run an owner-authorized bounded real-model comparison with normal parent tools available, same settings/start state, and independent checks. Reuse evaluation infrastructure; record dollars, cache usage and parent-context trajectory over follow-ups. Model/budget choices and retries follow owner policy; no paid run is implicit in planning.
6. Record failures and shortcomings without optimizing single-run metrics. Revisit scope or claims if the normal user must repeatedly manage child internals.

**Exit:** evidence for ordinary conversational use and a precise statement of what remains manual. Slower parent context growth is a measured outcome, not a guarantee based on transcript isolation alone.

## Stage 4 — Exact artifact and target VM acceptance

**Files:** `package.json`, `package-lock.json` only as needed, `README.md`, `docs/compatibility.md`; add a small reproducible installation smoke script under `evals/` if it replaces the external prototype, not a new test framework.

1. Confirm package name/ownership, issue URL and release authority with owner. Do not remove `private` or publish without explicit approval.
2. Run `npm ci`, `npm run check`, `npm test`; enable full Docker tests with the target's trusted pinned image. Expected current mechanical baseline is 125 tests; any added tests increase it. Explicit skips do not count as VM Docker validation.
3. Build using `npm pack --json`. Inspect actual contents and local documentation links; exclude credentials, raw sessions and development-only artifacts. Preserve tarball checksum and source revision.
4. Install that tarball in a clean target VM with isolated Pi configuration, then test extension loading and a complete scripted-provider scope/evidence/cancellation flow. No checkout imports or reliance on the developer's node_modules. Validate the chosen execution mode; report Docker as unsupported if unavailable rather than hiding it.
5. Exercise the agreed extension combinations against this artifact. Document versions and boundaries, including Pi loader errors that prevent pi-scopes itself from loading.
6. Review installation, one-time authority selection, ordinary use, removal, failure recovery and locally reviewable issue diagnostics. Run `git diff --check`, checkpoint and present release evidence.

**Exit:** an actual VM-tested candidate and known compatibility matrix, not merely a successful npm pack.

## Stage 5 — Owner-approved publication and registry smoke

**Files:** release metadata in `package.json`/lock if approved, user-facing release notes and `docs/STATUS.md`.

1. Present exact package identity/version/dist-tag, artifact/source checksums, supported setup, remaining limitations and test evidence. Obtain explicit publish approval.
2. Publish the reviewed artifact with the approved registry/tag; use normal account authentication without exposing tokens. If publication fails, preserve the error and do not change identity/registry or retry blindly.
3. Install the exact published version through `pi install npm:<approved-name>@<version>` in a fresh VM configuration. Verify loading and agreed smoke behavior; record artifact identity.
4. Publish concise issue-report instructions and distinguish experimental behavior from future targets. If smoke fails, report and agree remediation; do not silently label the release accepted.

**Exit:** user can obtain the exact package from npm and begin the documented ordinary workflow. Publication is a separate owner gate, not authorization contained in this plan.

## Deferred optimization ledger

Compact patches remain deferred. Trigger: repeated real workloads show meaningful retrieval cost/context burden or a reasonable patch fails the retention cap because of representation. No larger page sizes/tool proliferation as a substitute. This does not block the initial experimental release absent that evidence.
