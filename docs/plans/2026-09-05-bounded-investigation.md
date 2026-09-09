# Bounded Investigation Implementation Plan

**Goal:** Stop open-ended child investigation and give it a finite opportunity to return evidence using the existing in-process SDK and scope_return tool.

**Architecture:** Add a validated maxTurns investigation allowance (default 8, range 1–50). At a completed turn boundary stop the investigation, then run at most two return-only turns in the same child context. External cancellation and the existing total timeout always take precedence. Allow explicit partial structured returns. No transport, dependencies, or additional tools.

**Tech Stack:** Pi SDK 0.85.1, TypeScript, existing Vitest/local scripted HTTP provider.

1. Add failing integration checks in test/pi-integration.test.ts: allowance exhaustion, return-only tools, partial capsule/usage, ignored return instructions, external cancellation. Add invalid allowance checks.
2. Modify src/core/{types,scope-manager,scope-kernel}.ts and src/index.ts to validate, persist and describe maxTurns and self-contained goals.
3. Modify src/child/{pi-child-executor,return-tool}.ts to enforce completed-turn boundaries, bounded return-only phase and explicit partial outcome. Preserve disposal, traces and usage.
4. Run npm test and npm run check; inspect diff; document guarantees in docs/v0.1-contract.md and README.md.

Implemented and locally verified: 32 tests pass (including 18 real-SDK scripted-provider integration cases), npm run check passes, and git diff --check passes. Regression checks cover exhausted allowance, blocked work in return-only mode, validation repair, explicit partial return, and parent/timeout cancellation in return. No paid effectiveness evaluation has run for this change.

Limits: turns can contain multiple tools and large outputs. This is neither a token/cost cap nor a process sandbox. A total timeout or parent abort may precede return. Default 8 is provisional, not benchmark-tuned. No paid model-effectiveness claim, retries of prior studies, or commits in this slice.
