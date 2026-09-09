# Child playground: lessons and next direction

## Owner goal

A child workspace is a temporary place for doing good work, not an exercise in navigating restrictions. Prioritize ergonomics, familiarity, consistency, widely known conventions and generous scratch space. Keep the promised isolation boundary honest; disposability of files does not make external network actions disposable.

The success criterion is **a familiar, ready project**, not a long installed-tools list or a new permission framework.

## What is implemented

The equipped-child checkpoint supplies a Node/Python development image, owner-selected network/resources, compact on-PATH capability reporting, executable writable project/temp mounts, and dependency-safe automatic text patch capture. See [setup](../docker/README.md) and [exact contract](v0.1-contract.md).

A deterministic real-project workflow installed dependencies, typechecked and tested pi-scopes inside the guest and captured a no-change result. That verifies environment plumbing, not live-agent effectiveness across arbitrary projects. The broader [survey](sandbox-tooling-survey.md) informed equipment categories; it did not experimentally compare vendors.

## Independent advisory perspectives

Claude and AGY were consulted separately twice: first as reviewers, then explicitly as coding agents using a playground. Their answers are qualitative recommendations, not measured usability evidence. No implementation is approved merely by recording a suggestion here.

### As reviewers

- **Claude:** keep the ordinary Unix/build toolbox; improve capability discovery for custom images, dependency reuse, optional browser/language equipment and deliberate private-service access. Suggested filtered networking as an additional mode. Its claim that there is no extensibility was too broad: custom images already work; convenience/discovery are lacking.
- **AGY:** make pnpm/Yarn projects and server diagnostics straightforward; address clean-checkout friction and consider guest editing tools. Its claims about Bash editing failure rates were not supported by an experiment. Missing global pnpm does not prevent writable local installation. Container localhost is not automatically host localhost.

### As playground users

- **Claude:** arrive at the right project/runtime versions, with dependencies installed or readily installable, repository guidance, clear acceptance criteria and a known baseline. Run/edit/install locally without repeated mediation. Return changes plus verification.
- **AGY:** avoid turning environment setup into the assignment. Provide standard tools, ready dependencies, documented verification commands and scratch freedom. Expect the familiar status → reproduce → edit → test → diff/commit workflow. GUI/browser facilities can be absent unless relevant.

Both emphasized readiness over tool count. Two qualifications: a baseline need not be green (fixing it may be the task), but failures must be attributable; preinstalled dependencies are desirable, not universally necessary if installation is reliable.

Consultation references retained for provenance: reviewer runs `run_765be9b2f6d84aaa8b27cff1ca4cdf3b` (Claude), `run_1d55a2c18253477c8ea7791ff472b190` (AGY); playground-user runs `run_b6b8320d432f449d8bf923f95cdb4f2e` (Claude), `run_ccf881939a464b1cabc75492149e8fd8` (AGY). These local session references are not public evidence links.

## Proposed next work — not shipped

1. **Project readiness:** use project runtime/package-manager conventions and a documented baseline/reproduction command. Prefer preparation or straightforward installation over repeated agent troubleshooting.
2. **Familiar Git behavior:** the current copy excludes `.git`; installing Git alone does not provide status/history/diff/commit semantics. Decide which semantics the child needs and how to preserve a trustworthy handoff baseline before implementing.
3. **Current-work support:** clean committed input blocks delegation during unfinished work. Explore an explicit snapshot of current changes without losing user work or weakening capture integrity.
4. **Setup reuse and adequate space:** measure repeated dependency setup and representative builds before choosing cache machinery or changing resource defaults.
5. **Representative agent tasks:** test a non-npm package manager and a small web/backend task, measuring setup friction, task quality and combined cost. Paid runs require separate authorization.

## Deliberately deferred

No automatic commitment to credential brokers, filtering proxies, an image-profile framework, extra editing tools or universal extension inheritance. Introduce them for demonstrated needs. Compact diff optimization remains deferred under the owner's earlier decision. Automatic patch application, native Windows support and publication are not part of this checkpoint.

The next implementation should improve ordinary child work, not add every advisor suggestion. Preserve explicit failure reporting, cancellation, data integrity and no silent host fallback.
