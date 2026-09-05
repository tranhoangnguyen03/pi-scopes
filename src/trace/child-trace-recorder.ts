import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ScopeStore } from "../storage/scope-store.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finalAssistantText(event: AgentSessionEvent): string | undefined {
  if (event.type !== "message_end" || !isRecord(event.message) || event.message.role !== "assistant") return undefined;
  const content = event.message.content;
  if (!Array.isArray(content)) return undefined;
  return content
    .filter((part): part is { type: "text"; text: string } => isRecord(part) && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n") || undefined;
}

export class ChildTraceRecorder {
  private unsubscribe: (() => void) | undefined;
  private writes: Promise<void> = Promise.resolve();
  private latestText?: string;

  constructor(private readonly store: ScopeStore, private readonly scopeId: string) {}

  attach(session: AgentSession, onActivity?: (label: string) => void): void {
    this.unsubscribe = session.subscribe((event) => {
      const text = finalAssistantText(event);
      if (text) this.latestText = text;
      onActivity?.(event.type);
      this.writes = this.writes.then(async () => {
        const data = await this.captureLargeOutput(event);
        await this.store.appendTrace(this.scopeId, `pi.${event.type}`, data);
      });
    });
  }

  getFinalText(): string | undefined {
    return this.latestText;
  }

  async flush(): Promise<void> {
    await this.writes;
    await this.store.flush();
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private async captureLargeOutput(event: AgentSessionEvent): Promise<unknown> {
    if (event.type !== "tool_execution_end" || !isRecord(event.result) || !isRecord(event.result.details)) return event;
    const fullOutputPath = event.result.details.fullOutputPath;
    if (typeof fullOutputPath !== "string") return event;
    try {
      const blobRef = await this.store.copyBlob(this.scopeId, fullOutputPath, `${event.toolCallId}.log`);
      return {
        ...event,
        result: {
          ...event.result,
          details: { ...event.result.details, fullOutputPath, blobRef },
        },
      };
    } catch (error) {
      return {
        ...event,
        traceCaptureWarning: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
