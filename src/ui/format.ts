import { truncateHead } from "@earendil-works/pi-coding-agent";
import { MAX_CAPSULE_BYTES } from "../core/capsule.js";
import type { ResultCapsule, ScopeRecord, TraceEvent } from "../core/types.js";

export function formatScopeTree(scopes: readonly ScopeRecord[], page = 1): string {
  const root = scopes.find((scope) => scope.id === "root");
  const children = scopes.filter((scope) => scope.parentId === "root");
  const pages = Math.max(1, Math.ceil(children.length / 10));
  if (!Number.isSafeInteger(page) || page < 1 || page > pages) throw new Error(`Scope list has ${pages} page(s). Start with scope({"action":"inspect"}).`);
  const lines = [root ? `● root  ${root.status}` : "? root  unavailable", `Scopes: page ${page}/${pages}`];
  for (const child of children.slice((page - 1) * 10, page * 10)) {
    const marker = child.status === "active" ? "↳" : child.status === "completed" ? "✓" : child.status === "cancelled" ? "×" : "!";
    const goal = Array.from(child.goal.replace(/\s+/g, " "));
    lines.push(`${marker} ${child.id}  ${child.status}${child.context ? ` [${child.context}]` : ""}  ${goal.slice(0, 100).join("")}${goal.length > 100 ? "…" : ""}`);
    lines.push(`  Evidence: scope(${JSON.stringify({ action: "inspect", scopeId: child.id })})`);
  }
  if (children.length === 0) lines.push("  No child scopes.");
  if (page < pages) lines.push(`Next: scope(${JSON.stringify({ action: "inspect", page: page + 1 })})`);
  return lines.join("\n");
}

export function formatScope(scope: ScopeRecord): string {
  return [
    `${scope.id} · ${scope.status}`,
    `goal: ${scope.goal}`,
    `kind: ${scope.kind}`,
    ...(scope.context ? [`context: ${scope.context}`] : []),
    `workspace: ${scope.workspaceMode}`,
    ...(scope.runtime.containerName ? [`container: ${scope.runtime.containerName}`] : []),
    ...(scope.runtime.sourceRevision ? [`source revision: ${scope.runtime.sourceRevision}`] : []),
    `runtime: ${scope.runtime.state}`,
    `timeout: ${scope.budget.timeoutMs === 0 ? "none" : `${Math.round(scope.budget.timeoutMs / 1000)}s`}`,
    `trace: ${scope.traceRef}`,
    ...(scope.resultRef ? [`result: ${scope.resultRef}`] : []),
    ...(scope.error ? [`error: ${scope.error}`] : []),
  ].join("\n");
}

export function formatCapsule(capsule: ResultCapsule): string {
  const lines = [
    `${capsule.scopeId} · ${capsule.status}${capsule.context ? ` · ${capsule.context} context` : ""}${capsule.workspaceMode ? ` · ${capsule.workspaceMode}` : ""}`,
    ...(capsule.sourceRevision ? [`Project copy: ${capsule.sourceRevision}; guest files are not promoted or retained.`] : []),
    capsule.summary,
  ];
  if (capsule.patch) {
    if (capsule.patch.status === "captured" && capsule.patch.blobRef) {
      const stats = capsule.patch.stats
        ? ` (${capsule.patch.stats.files} file${capsule.patch.stats.files === 1 ? "" : "s"}, +${capsule.patch.stats.additions} -${capsule.patch.stats.deletions})`
        : "";
      lines.push(`Workspace patch: captured${stats}\nRef: ${capsule.patch.blobRef}\nSource: ${capsule.patch.sourceRevision ?? capsule.sourceRevision}`);
    } else if (capsule.patch.status === "no-change") {
      lines.push(`Workspace patch: no changes from source revision ${capsule.patch.sourceRevision ?? capsule.sourceRevision}.`);
    } else if (capsule.patch.status === "error") {
      lines.push(`Workspace patch: capture failed: ${capsule.patch.error}`);
    } else if (capsule.patch.status === "unavailable") {
      lines.push(`Workspace patch: unavailable${capsule.patch.error ? ` (${capsule.patch.error})` : ""}.`);
    }
  }
  if (capsule.conclusions?.length) lines.push(`Conclusions:\n${capsule.conclusions.map((item) => `- ${item}`).join("\n")}`);
  if (capsule.evidence?.length) lines.push(`Evidence:\n${capsule.evidence.map((item) => `- ${item.summary}${item.source ? ` (${item.source})` : ""}`).join("\n")}`);
  if (capsule.artifacts?.length) lines.push(`Artifacts:\n${capsule.artifacts.map((item) => `- ${item.label}: ${item.ref}`).join("\n")}`);
  if (capsule.decisions?.length) lines.push(`Decisions:\n${capsule.decisions.map((item) => `- ${item}`).join("\n")}`);
  if (capsule.unresolved?.length) lines.push(`Unresolved:\n${capsule.unresolved.map((item) => `- ${item}`).join("\n")}`);
  if (capsule.confidence !== undefined) lines.push(`Confidence: ${capsule.confidence}`);
  if (capsule.error) lines.push(`Error: ${capsule.error}`);
  if (capsule.fallbackReason) lines.push(`Fallback: ${capsule.fallbackReason}`);
  const trace = `\n\nTrace: ${capsule.traceRef}\nSupporting tool evidence: scope(${JSON.stringify({ action: "inspect", scopeId: capsule.scopeId })})`;
  const text = lines.join("\n\n");
  if (Buffer.byteLength(text + trace, "utf8") <= MAX_CAPSULE_BYTES) return text + trace;
  const footer = `\n\n[Capsule display truncated; full result retained on disk.]${trace}`;
  return truncateHead(text, {
    maxBytes: MAX_CAPSULE_BYTES - Buffer.byteLength(footer, "utf8"),
    maxLines: Number.MAX_SAFE_INTEGER,
  }).content + footer;
}

export function formatTrace(events: readonly TraceEvent[], tracePath: string, limit = 20): string {
  const shown = events.slice(-limit);
  const lines = shown.map((event) => `${event.sequence}. ${event.timestamp}  ${event.type}`);
  if (events.length > shown.length) lines.unshift(`Showing the last ${shown.length} of ${events.length} events.`);
  if (events.length === 0) lines.push("No trace events recorded.");
  lines.push(`Full trace: ${tracePath}`);
  return lines.join("\n");
}
