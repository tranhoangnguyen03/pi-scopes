import type { ResultCapsule, ScopeRecord, TraceEvent } from "../core/types.js";

export function formatScopeTree(scopes: readonly ScopeRecord[]): string {
  const root = scopes.find((scope) => scope.id === "root");
  const children = scopes.filter((scope) => scope.parentId === "root");
  const lines = [root ? `● root  ${root.status}` : "? root  unavailable"];
  for (const child of children) {
    const marker = child.status === "active" ? "↳" : child.status === "completed" ? "✓" : child.status === "cancelled" ? "×" : "!";
    lines.push(`${marker} ${child.id}  ${child.status}  ${child.goal}`);
  }
  if (children.length === 0) lines.push("  No child scopes.");
  return lines.join("\n");
}

export function formatScope(scope: ScopeRecord): string {
  return [
    `${scope.id} · ${scope.status}`,
    `goal: ${scope.goal}`,
    `kind: ${scope.kind}`,
    `workspace: ${scope.workspaceMode}`,
    `runtime: ${scope.runtime.state}`,
    `timeout: ${scope.budget.timeoutMs === 0 ? "none" : `${Math.round(scope.budget.timeoutMs / 1000)}s`}`,
    `trace: ${scope.traceRef}`,
    ...(scope.resultRef ? [`result: ${scope.resultRef}`] : []),
    ...(scope.error ? [`error: ${scope.error}`] : []),
  ].join("\n");
}

export function formatCapsule(capsule: ResultCapsule): string {
  const lines = [
    `${capsule.scopeId} · ${capsule.status}`,
    capsule.summary,
  ];
  if (capsule.conclusions?.length) lines.push(`Conclusions:\n${capsule.conclusions.map((item) => `- ${item}`).join("\n")}`);
  if (capsule.unresolved?.length) lines.push(`Unresolved:\n${capsule.unresolved.map((item) => `- ${item}`).join("\n")}`);
  lines.push(`Trace: ${capsule.traceRef}`);
  return lines.join("\n\n");
}

export function formatTrace(events: readonly TraceEvent[], tracePath: string, limit = 20): string {
  const shown = events.slice(-limit);
  const lines = shown.map((event) => `${event.sequence}. ${event.timestamp}  ${event.type}`);
  if (events.length > shown.length) lines.unshift(`Showing the last ${shown.length} of ${events.length} events.`);
  if (events.length === 0) lines.push("No trace events recorded.");
  lines.push(`Full trace: ${tracePath}`);
  return lines.join("\n");
}
