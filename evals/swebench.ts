import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const SWEBENCH_VERSION = "5.0.2";
export const VERIFIED_DATASET = "verified";
export const GOLD_SMOKE_INSTANCE = "sympy__sympy-20590";

export interface SweBenchPrediction {
  instance_id: string;
  model_name_or_path: string;
  model_patch: string;
}

export interface GradeOptions {
  predictions?: string;
  gold?: boolean;
  runId: string;
  workers?: number;
  timeoutSeconds?: number;
  taskRepo?: string;
  instanceIds?: string[];
}

export function prediction(instanceId: string, modelName: string, patch: string): SweBenchPrediction {
  if (!instanceId.trim()) throw new Error("instance id is required");
  if (!modelName.trim()) throw new Error("model name is required");
  return {
    instance_id: instanceId.trim(),
    model_name_or_path: modelName.trim(),
    model_patch: patch,
  };
}

export async function upsertPrediction(filePath: string, value: SweBenchPrediction): Promise<void> {
  let existing: SweBenchPrediction[] = [];
  try {
    const content = await readFile(filePath, "utf8");
    existing = content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as SweBenchPrediction);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const byInstance = new Map(existing.map((entry) => [entry.instance_id, entry]));
  byInstance.set(value.instance_id, value);
  const serialized = [...byInstance.values()]
    .sort((a, b) => a.instance_id.localeCompare(b.instance_id))
    .map((entry) => JSON.stringify(entry))
    .join("\n");
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${serialized}\n`, "utf8");
  await rename(temporary, filePath);
}

export function gradeArguments(options: GradeOptions): string[] {
  if (!options.runId.trim()) throw new Error("run id is required");
  if (options.gold === Boolean(options.predictions)) {
    throw new Error("provide exactly one of gold or predictions");
  }
  const args = ["eval", VERIFIED_DATASET];
  if (options.gold) args.push("--gold");
  else args.push("-p", path.resolve(options.predictions as string));
  args.push("--run-id", options.runId, "--workers", String(options.workers ?? 1));
  args.push("--timeout", String(options.timeoutSeconds ?? 1_800));
  if (options.taskRepo) args.push("--task-repo", path.resolve(options.taskRepo));
  for (const instanceId of options.instanceIds ?? []) args.push("--instance", instanceId);
  return args;
}
