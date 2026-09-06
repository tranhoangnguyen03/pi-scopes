import { describe, expect, it } from "vitest";
import { fallbackCapsuleInput, validateCapsuleInput } from "../src/core/capsule.js";
import { formatCapsule } from "../src/ui/format.js";

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

  it("rejects capsules exceeding 16,000 serialized UTF-8 bytes across fields", () => {
    for (const item of ["x".repeat(4_000), "界".repeat(2_000)]) {
      const result = validateCapsuleInput({ summary: "Findings", conclusions: [item, item, item, item] });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join(" ")).toContain("16000");
    }
    const summary = "x".repeat(7_900);
    const remaining = 16_000 - Buffer.byteLength(JSON.stringify({ summary, decisions: [""] }));
    // Use three individually valid items to approach the aggregate boundary.
    const decisions = ["y".repeat(3_000), "z".repeat(3_000), "w".repeat(remaining - 6_000 - 6)];
    expect(Buffer.byteLength(JSON.stringify({ summary, decisions }))).toBe(16_000);
    expect(validateCapsuleInput({ summary, decisions }).ok).toBe(true);
    decisions[2] += "w";
    expect(validateCapsuleInput({ summary, decisions }).ok).toBe(false);
  });

  it("includes every semantic field in the parent-facing text", () => {
    const text = formatCapsule({
      scopeId: "sc_test", status: "completed", traceRef: "trace://test/sc_test",
      summary: "Found it", conclusions: ["Root cause identified"],
      evidence: [{ summary: "Reproduced", source: "src/example.ts:42" }],
      artifacts: [{ label: "Report", ref: "/workspace/report.md" }],
      decisions: ["Keep the existing API"], unresolved: ["Deployment untested"], confidence: 0.8,
    });
    for (const value of ["Found it", "Root cause identified", "Reproduced", "src/example.ts:42",
      "Report", "/workspace/report.md", "Keep the existing API", "Deployment untested", "0.8"]) {
      expect(text).toContain(value);
    }
  });

  it("bounds legacy and fallback display output without losing the trace reference", () => {
    const text = formatCapsule({
      scopeId: "sc_test", status: "partial", traceRef: "trace://test/sc_test",
      summary: "界".repeat(20_000), unresolved: ["x".repeat(20_000)],
    });
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(16_000);
    expect(text).toContain("truncated");
    expect(text).toContain("trace://test/sc_test");
    expect(text).not.toContain("\uFFFD");
  });

  it("preserves recoverable final text in fallback capsules", () => {
    expect(fallbackCapsuleInput("  useful partial result  ", "missing return tool")).toEqual({
      summary: "useful partial result",
      unresolved: ["missing return tool"],
    });
  });
});
