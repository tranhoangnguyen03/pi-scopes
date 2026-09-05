import type { ResultCapsuleInput } from "./types.js";

const MAX_SUMMARY_LENGTH = 8_000;
const MAX_ITEM_LENGTH = 4_000;
const MAX_ITEMS = 50;

export type CapsuleValidation =
  | { ok: true; value: ResultCapsuleInput }
  | { ok: false; errors: string[] };

function optionalStrings(value: unknown, field: string, errors: string[]): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return undefined;
  }
  if (value.length > MAX_ITEMS) errors.push(`${field} may contain at most ${MAX_ITEMS} items`);
  const strings = value.slice(0, MAX_ITEMS).filter((item): item is string => {
    if (typeof item !== "string") {
      errors.push(`${field} entries must be strings`);
      return false;
    }
    if (item.length > MAX_ITEM_LENGTH) errors.push(`${field} entries may contain at most ${MAX_ITEM_LENGTH} characters`);
    return true;
  });
  return strings.map((item) => item.slice(0, MAX_ITEM_LENGTH));
}

export function validateCapsuleInput(value: unknown): CapsuleValidation {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["capsule must be an object"] };
  }

  const input = value as Record<string, unknown>;
  if (typeof input.summary !== "string" || input.summary.trim().length === 0) {
    errors.push("summary must be a non-empty string");
  } else if (input.summary.length > MAX_SUMMARY_LENGTH) {
    errors.push(`summary may contain at most ${MAX_SUMMARY_LENGTH} characters`);
  }

  let confidence: number | undefined;
  if (input.confidence !== undefined) {
    if (typeof input.confidence !== "number" || input.confidence < 0 || input.confidence > 1) {
      errors.push("confidence must be a number from 0 to 1");
    } else {
      confidence = input.confidence;
    }
  }

  const conclusions = optionalStrings(input.conclusions, "conclusions", errors);
  const decisions = optionalStrings(input.decisions, "decisions", errors);
  const unresolved = optionalStrings(input.unresolved, "unresolved", errors);

  const evidence = input.evidence === undefined
    ? undefined
    : Array.isArray(input.evidence)
      ? input.evidence.slice(0, MAX_ITEMS).flatMap((entry, index) => {
          if (typeof entry !== "object" || entry === null || typeof (entry as Record<string, unknown>).summary !== "string") {
            errors.push(`evidence[${index}] must contain a string summary`);
            return [];
          }
          const raw = entry as Record<string, unknown>;
          if (raw.source !== undefined && typeof raw.source !== "string") {
            errors.push(`evidence[${index}].source must be a string`);
            return [];
          }
          return [{
            summary: (raw.summary as string).slice(0, MAX_ITEM_LENGTH),
            ...(typeof raw.source === "string" ? { source: raw.source.slice(0, MAX_ITEM_LENGTH) } : {}),
          }];
        })
      : (errors.push("evidence must be an array"), undefined);

  const artifacts = input.artifacts === undefined
    ? undefined
    : Array.isArray(input.artifacts)
      ? input.artifacts.slice(0, MAX_ITEMS).flatMap((entry, index) => {
          if (typeof entry !== "object" || entry === null) {
            errors.push(`artifacts[${index}] must be an object`);
            return [];
          }
          const raw = entry as Record<string, unknown>;
          if (typeof raw.label !== "string" || typeof raw.ref !== "string") {
            errors.push(`artifacts[${index}] must contain string label and ref fields`);
            return [];
          }
          return [{ label: raw.label.slice(0, MAX_ITEM_LENGTH), ref: raw.ref.slice(0, MAX_ITEM_LENGTH) }];
        })
      : (errors.push("artifacts must be an array"), undefined);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      summary: (input.summary as string).slice(0, MAX_SUMMARY_LENGTH),
      ...(conclusions ? { conclusions } : {}),
      ...(evidence ? { evidence } : {}),
      ...(artifacts ? { artifacts } : {}),
      ...(decisions ? { decisions } : {}),
      ...(unresolved ? { unresolved } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
    },
  };
}

export function fallbackCapsuleInput(finalText: string | undefined, reason: string): ResultCapsuleInput {
  const text = finalText?.trim();
  return {
    summary: text ? text.slice(0, MAX_SUMMARY_LENGTH) : "The child ended without a recoverable summary.",
    unresolved: [reason],
  };
}
