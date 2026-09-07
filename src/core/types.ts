import type { Usage } from "@earendil-works/pi-ai";

export const SCOPE_SCHEMA_VERSION = 1 as const;

export type ScopeId = string;
export type ContextMode = "fresh" | "fork";
export type ScopeStatus = "active" | "completed" | "partial" | "failed" | "cancelled";
export type RuntimeState = "active" | "disposed";

export interface ScopeBudget {
  timeoutMs: number;
  maxTurns?: number;
}

export interface ScopeRecord {
  schemaVersion: typeof SCOPE_SCHEMA_VERSION;
  id: ScopeId;
  parentId: ScopeId | null;
  kind: "root" | "subsession";
  goal: string;
  context?: ContextMode;
  status: ScopeStatus;
  workspaceMode: "host-shared";
  cwd: string;
  budget: ScopeBudget;
  runtime: {
    state: RuntimeState;
    scratchPath?: string;
  };
  traceRef: string;
  resultRef?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface Evidence {
  summary: string;
  source?: string;
}

export interface ArtifactRef {
  label: string;
  ref: string;
}

export interface ResultCapsuleInput {
  summary: string;
  conclusions?: string[];
  evidence?: Evidence[];
  artifacts?: ArtifactRef[];
  decisions?: string[];
  unresolved?: string[];
  confidence?: number;
}

export interface ResultCapsule extends ResultCapsuleInput {
  status: Exclude<ScopeStatus, "active">;
  scopeId: ScopeId;
  context?: ContextMode;
  traceRef: string;
  fallbackReason?: string;
  error?: string;
  usage?: ChildUsage;
}

export interface TraceEvent {
  schemaVersion: typeof SCOPE_SCHEMA_VERSION;
  id: string;
  sequence: number;
  scopeId: ScopeId;
  timestamp: string;
  type: string;
  data: unknown;
}

export interface ChildUsage extends Usage {
  turns: number;
}

export interface ChildExecutionResult {
  status: "completed" | "partial" | "failed" | "cancelled";
  capsuleInput?: ResultCapsuleInput;
  fallbackReason?: string;
  finalText?: string;
  error?: string;
  usage: ChildUsage;
}
