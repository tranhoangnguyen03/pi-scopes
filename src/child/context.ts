import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

export interface ParentSnapshot {
  entries: SessionEntry[];
  systemPrompt: string;
  parentSessionId: string;
  parentEntryId: string | null;
}

export function snapshotParent(ctx: Pick<ExtensionContext, "sessionManager" | "getSystemPrompt">, toolCallId: string): ParentSnapshot {
  const branch = ctx.sessionManager.getBranch();
  // Exclude the invoking assistant message and any sibling results: its run call is unfinished.
  let boundary = -1;
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i]!;
    if (entry.type === "message" && entry.message.role === "assistant" &&
      entry.message.content.some((part) => part.type === "toolCall" && part.id === toolCallId)) {
      boundary = i;
      break;
    }
  }
  if (boundary < 0) throw new Error("Cannot snapshot the active run call. No child started; use fresh context with a self-contained goal.");
  return { entries: structuredClone(branch.slice(0, boundary)), systemPrompt: ctx.getSystemPrompt(),
    parentSessionId: ctx.sessionManager.getSessionId(), parentEntryId: branch[boundary - 1]?.id ?? null };
}
