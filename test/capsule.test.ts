import { describe, expect, it } from "vitest";
import { fallbackCapsuleInput, validateCapsuleInput } from "../src/core/capsule.js";

describe("result capsules", () => {
  it("accepts a bounded structured capsule", () => {
    const result = validateCapsuleInput({
      summary: "Found the boundary.",
      conclusions: ["Child state is isolated."],
      evidence: [{ summary: "Unit test", source: "test/capsule.test.ts" }],
      confidence: 0.9,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        summary: "Found the boundary.",
        conclusions: ["Child state is isolated."],
        evidence: [{ summary: "Unit test", source: "test/capsule.test.ts" }],
        confidence: 0.9,
      },
    });
  });

  it("rejects malformed capsules", () => {
    const result = validateCapsuleInput({ summary: "", confidence: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(expect.arrayContaining([
      "summary must be a non-empty string",
      "confidence must be a number from 0 to 1",
    ]));
  });

  it("preserves recoverable final text in fallback capsules", () => {
    expect(fallbackCapsuleInput("  useful partial result  ", "missing return tool")).toEqual({
      summary: "useful partial result",
      unresolved: ["missing return tool"],
    });
  });
});
