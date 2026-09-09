import type { Usage } from "@earendil-works/pi-ai";

export const SCOPE_SCHEMA_VERSION = 1 as const;

export type ScopeId = string;
export type ContextMode = "fresh" | "fork";
export type ScopeStatus = "active" | "completed" | "partial" | "failed" | "cancelled";
export type RuntimeState = "active" | "disposed" | "cleanup-failed";
export type WorkspaceMode = "host-shared" | "docker-copy";

export interface ScopeBudget {
  timeoutMs: number;
  maxTurns?: number;
}

export interface DockerPolicy {
  network: "none" | "bridge";
  memory: string;
  cpus: number;
  pidsLimit: number;
  workspaceSize: string;
  tmpSize: string;
  warning?: string;
}

export interface GuestCapabilities {
  tools: Record<string, string>;
  missing: string[];
  network: "none" | "bridge";
  summary: string;
}

export interface ScopeRecord {
  schemaVersion: typeof SCOPE_SCHEMA_VERSION;
  id: ScopeId;
  parentId: ScopeId | null;
  kind: "root" | "subsession";
  goal: string;
  context?: ContextMode;
  status: ScopeStatus;
  workspaceMode: WorkspaceMode;
  cwd: string;
  budget: ScopeBudget;
  runtime: {
    state: RuntimeState;
    scratchPath?: string;
    image?: string;
    containerName?: string;
    sourceRevision?: string;
    dockerPolicy?: DockerPolicy;
    capabilities?: GuestCapabilities;
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

export interface PatchStats {
  files: number;
  additions: number;
  deletions: number;
}

export interface PatchSummary {
  status: "captured" | "no-change" | "unavailable" | "error";
  blobRef?: string;
  sourceRevision?: string;
  files?: string[];
  stats?: PatchStats;
  error?: string;
}

export interface ResultCapsule extends ResultCapsuleInput {
  status: Exclude<ScopeStatus, "active">;
  scopeId: ScopeId;
  context?: ContextMode;
  workspaceMode?: WorkspaceMode;
  sourceRevision?: string;
  traceRef: string;
  fallbackReason?: string;
  error?: string;
  usage?: ChildUsage;
  patch?: PatchSummary;
  dockerPolicy?: DockerPolicy;
  capabilities?: GuestCapabilities;
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
  patch?: PatchSummary;
  dockerPolicy?: DockerPolicy;
  capabilities?: GuestCapabilities;
}
