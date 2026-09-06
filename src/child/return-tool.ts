import { StringEnum } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { MAX_CAPSULE_BYTES, validateCapsuleInput } from "../core/capsule.js";
import type { ResultCapsuleInput } from "../core/types.js";

const ReturnParameters = Type.Object({
  outcome: StringEnum(["complete", "partial"] as const, { description: "Use partial when evidence is incomplete or the goal cannot be answered within the allowance." }),
  summary: Type.String({ minLength: 1, maxLength: 8_000 }),
  conclusions: Type.Optional(Type.Array(Type.String({ maxLength: 4_000 }), { maxItems: 50 })),
  evidence: Type.Optional(Type.Array(Type.Object({
    summary: Type.String({ maxLength: 4_000 }),
    source: Type.Optional(Type.String({ maxLength: 4_000 })),
  }), { maxItems: 50 })),
  artifacts: Type.Optional(Type.Array(Type.Object({
    label: Type.String({ maxLength: 4_000 }),
    ref: Type.String({ maxLength: 4_000 }),
  }), { maxItems: 50 })),
  decisions: Type.Optional(Type.Array(Type.String({ maxLength: 4_000 }), { maxItems: 50 })),
  unresolved: Type.Optional(Type.Array(Type.String({ maxLength: 4_000 }), { maxItems: 50 })),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

export function createScopeReturnTool(onReturn: (capsule: ResultCapsuleInput, outcome: "complete" | "partial") => void): ToolDefinition<typeof ReturnParameters> {
  return {
    name: "scope_return",
    label: "Return scope",
    description: `Return the final result to the parent. The capsule fields together must fit within ${MAX_CAPSULE_BYTES} serialized UTF-8 bytes. Call this alone when the investigation is complete.`,
    promptSnippet: "Return the current child scope to its parent",
    promptGuidelines: ["Call scope_return alone when the child investigation is complete."],
    parameters: ReturnParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const { outcome, ...candidate } = params;
      const validated = validateCapsuleInput(candidate);
      if (!validated.ok) throw new Error(`Invalid result capsule: ${validated.errors.join("; ")}`);
      onReturn(validated.value, outcome);
      return {
        content: [{ type: "text", text: "Result capsule accepted and returned to the parent." }],
        details: { capsuleCaptured: true },
        terminate: true,
      };
    },
  };
}
