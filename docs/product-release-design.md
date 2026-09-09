# Product destination: install in a VM, keep talking to the main agent

Status: release design, not shipped behavior. Owner approved planning and documentation consolidation; npm publication and authority changes need separate approval. Baseline: reviewed experimental commit `a2cab01`.

## User outcome

Install a pi-scope package from npm into a VM, configure it once, and use ordinary Pi conversation. The main agent should selectively delegate substantial work, maintain output quality, and accumulate distracting investigation detail more slowly than regular Pi. The user should not manage children, patch construction, evidence pagination or internal recovery. Important failures and authority decisions must remain visible.

Existing extensions should keep working in the parent wherever possible. Known conflicts or missing child capabilities should be explained with impact, options and a reviewable issue-report summary. Unknown compatibility is not declared safe. Universal conflict detection is not achievable with arbitrary extensions.

## Operating philosophy (owner clarification)

Get out of agents' way: equip children for good work and keep initial guardrails minimal and justified. Add safeguards in response to observed failure modes, not speculative scenarios. Existing tiny capacity limits and offline/preinstalled-only operation are prototype choices, not fixed product goals. Preserve integrity/error reporting and the explicitly promised isolation boundary; resource/workflow restrictions should be reconsidered when they block ordinary work. See [sandbox equipment survey](sandbox-tooling-survey.md). This direction does not silently change current network, credential or host-access authority.

## Architecture choice

Considered directions:

1. **Thin Pi-native package (recommended):** retain one same-model child, fresh/fork context, in-process callbacks, Bash-based work and existing scope run/inspect/read. Add only readiness checks, actionable diagnostics and task-completion guidance needed for normal use.
2. Broad child extension inheritance: potentially convenient, but brings hooks, orchestration recursion, tools and permissions across a boundary they were not designed for. Deferred; inheritance is not a shortcut to compatibility.
3. Separate orchestration/messaging platform: unnecessary for the stated install-and-chat experience. Not planned.

This is a productization milestone, not a rewrite. Agent judgment uses compact tool guidance and current Pi mechanisms; no new orchestration tool family or forced delegation on every task.

## Normal workflow and authority

The parent remains the user's interface. It does trivial work directly, delegates substantial bounded work with enough context and a stopping criterion, reads only missing evidence, verifies significant claims, and completes the user's task or explains a specific blocker. Starting context and filesystem authority remain separate.

Docker produces a retained patch, not a finished edit in the parent checkout. This is a real product gap for a hands-off coding workflow. The release must either demonstrate the parent completing a reviewed application using its existing authorized tools, or clearly limit Docker tasks to proposals. Do not claim hands-off implementation from patch capture alone. No automatic blind application, bypass of parent permission extensions, or silent host fallback. Changes made to the parent tree since capture must be considered before application.

The VM itself does not make unrestricted child work harmless to the VM's files or credentials. Current host mode is unrestricted and does not inherit permission hooks. Proposed release setup should require an understandable one-time authority decision rather than accidentally hiding this default. Do not change runtime defaults as part of documentation work.

## Compatibility design

Distinguish:

- Parent extension coexistence: duplicate tool/command names, startup/session hooks and configured provider behavior.
- Child capability availability: dynamic providers, custom tools and permission hooks are not automatically inherited.
- Environment readiness: missing Docker/image/dependencies, incompatible Pi version and unsupported snapshot input. These are not necessarily extension conflicts.

Inspect only what the supported Pi API exposes; first verify those APIs against pinned Pi documentation/source. Do not infer loaded extensions from directory names, scrape arbitrary private state or build a speculative compatibility framework.

Warnings should identify the observed condition, affected operation, what still works, and choices: change configuration, disable one extension, or file an issue. Block only an operation whose required capability/authority cannot be honored. Do not disable other extensions or change their settings. Avoid repeated per-turn warnings. If a collision prevents this extension from loading, document Pi's own loader diagnostics and recovery rather than promise a self-warning that cannot run.

Issue diagnostics should be opt-in and locally reviewable: package/Pi/Node/platform versions, execution mode, bounded error category and identifiers actually observed. Do not include auth, prompts, code, environment dumps, raw traces or absolute paths by default; do not auto-upload. Compatibility results are versioned observations, not permanent allowlists.

## Acceptance criteria

### Installation and usability

- Exact release tarball installs from npm in a clean target VM, using documented steps and no development-checkout imports.
- Before publication, the same artifact is tested through a local tarball; after publication, perform the registry-install check. Never label a tarball-only check as registry validation.
- User gives an ordinary task, without explicit scope calls or backup/diff instructions; parent chooses a suitable scope and completes the task or reports a meaningful blocker.
- A small direct task remains direct; a substantial task exercises delegation and evidence reuse.
- Host and Docker behavior, unsupported configurations, cancellation and cleanup are understandable. Setup is one-time where possible; important failure reporting is not hidden for smoothness.

### Quality and context

Use a bounded representative set of ordinary multi-step tasks with extension off/on, same model/provider/settings/start state, and independent outcome checks. Report final parent context and trajectory across follow-ups separately from cumulative tokens, total dollars, cache usage and unnecessary re-investigation. Do not restrict the parent to scope-only tools for a claim about natural adoption. Do not feed the control solution into treatment. Record ordering, limitations and failed runs; no automatic paid retries.

Release claims must match evidence. Lower context growth with worse output is not success. A useful experimental release can disclose inconclusive comparative results; it must not market an unproven benefit as established.

### Compatibility and support

Test a small owner-selected set of actual extensions plus controlled collision/missing-capability fixtures. Demonstrate useful diagnostics for observable conflicts and explicitly report untested combinations. No promise that parent-only extensions are available in a child.

## Decisions before release, not before useful work

- npm identity: retain `@tranhoangnguyen03/pi-scopes` or choose `pi-scope`/another name after checking availability and ownership. No rename or reservation is implied.
- Owner-approved platform targets: macOS, Linux, and Windows through WSL2. Native Windows is not required for the initial release. CPU architectures, Node/Pi versions and Docker availability remain to be established. Validate macOS/Linux first, then WSL2 explicitly; a Linux pass alone is not WSL2 acceptance evidence.
- Release execution default and one-time authority acknowledgement, particularly alongside permission extensions.
- Owner-selected compatibility set and diagnostic disclosure preferences.
- Release version/dist-tag, repository/issue metadata and final publication approval.

Work that does not depend on these decisions can proceed. Ask only when a concrete implementation or release gate needs an answer.

## Non-goals and deferred work

No universal compatibility certification, automatic arbitrary tool inheritance, parallel swarm, socket service, unlimited sandbox generalization, performance campaign or compact-diff rewrite. Preserve the current limits unless ordinary-work evidence shows they prevent the target experience. Public release remains experimental until broader validation supports stronger claims.
