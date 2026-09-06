# Bounded Evidence Retrieval Plan

Goal: let the parent recover a selected recorded tool call/result without another child or command execution.

API: existing scope inspect without scopeId lists scopes; inspect with scopeId returns a short capsule summary and ten numbered work-tool records per page. scope read with scopeId and item reads one stable 1-based tool-call item, paginated with exact continuation calls. Scope IDs are local to the current parent session. scope_return is not an evidence item. Index labels are literal argument/output excerpts, not generated conclusions.

Implementation: src/trace/evidence.ts projects paired start/end events and renders bounded pages; ScopeStore reads only validated retained blob references under the same scope/session. src/index.ts routes validated retrieval requests without creating a child. src/ui/format.ts adds an inspect call to capsule footers within the existing cap. New Vitest tests and real-SDK scripted-provider integration cover discover → inspect → read, paging, missing records, no tool replay, and retained output blobs after scratch cleanup.

Limits: plaintext tool evidence can contain untrusted instructions/secrets; label it historical data. No transcript/thinking dump, semantic search, child resume or arbitrary filesystem reads. Reuse existing readTrace for this small prototype; streaming indexes can follow if trace size becomes a measured problem. Output pages are bounded, local trace-loading memory is not. No paid model run in this implementation slice.

Verification: failing tests first, then npm test, npm run check, git diff --check. Preserve prior experiment artifacts and all existing uncommitted work; no commits or dependency additions.

Implemented with 45 passing tests in the primary checkout, including the scripted-provider parent discover → inspect → read flow, no replay, Unicode pagination, retained blobs, missing records, sequential duplicate IDs, ambiguous overlapping IDs, and command/routing recovery. AGY performed a read-only review; its sandbox could not run HTTP integration tests (connect EPERM on localhost), so those results are not claimed as independently verified. No retry/fallback of that reviewer run. Verified review findings addressed: ambiguous output association (reject rather than unsafe FIFO guessing), unreadable-blob fallback, bare /scope default, and invalid-page guidance. Corrupt trace JSON still surfaces a storage error; retrieval does not repair damaged files. No paid model-effectiveness run in this slice.

Checkpoint refinement: the later GLM usability check exposed avoidable round trips for ASCII output. Output pages now carry up to 6,000 UTF-8 bytes (whole code points), with the complete response still within 8 KiB. A local regression checks a 4,000-character ASCII record fits one page and mixed UTF-8 reconstructs exactly across pages. No paid rerun was needed.
