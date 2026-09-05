#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile, statfs } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  GOLD_SMOKE_INSTANCE,
  SWEBENCH_VERSION,
  gradeArguments,
  prediction,
  upsertPrediction,
} from "./swebench.ts";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(args: string[], name: string): string {
  const value = option(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function commandAvailable(command: string): boolean {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

async function doctor(): Promise<number> {
  const docker = commandAvailable("docker");
  const swebench = commandAvailable("swebench");
  const disk = await statfs(process.cwd());
  const freeGiB = Number(disk.bavail * disk.bsize) / 1024 ** 3;
  const supported = process.platform === "linux" || process.platform === "darwin";

  console.log(`platform: ${process.platform}/${process.arch} ${supported ? "ok" : "unsupported"}`);
  console.log(`docker: ${docker ? "found" : "missing"}`);
  console.log(`swebench: ${swebench ? "found" : `missing (pin swebench==${SWEBENCH_VERSION})`}`);
  console.log(`free disk: ${freeGiB.toFixed(1)} GiB ${freeGiB >= 120 ? "ok" : "below 120 GiB recommendation"}`);
  return supported && docker && swebench ? 0 : 1;
}

async function makePrediction(args: string[]): Promise<number> {
  const patchPath = path.resolve(required(args, "--patch"));
  const outputPath = path.resolve(required(args, "--out"));
  const value = prediction(
    required(args, "--instance"),
    required(args, "--model"),
    await readFile(patchPath, "utf8"),
  );
  await upsertPrediction(outputPath, value);
  console.log(`wrote ${value.instance_id} to ${outputPath}`);
  return 0;
}

function runGrade(args: string[], gold = false): number {
  const instances = args.flatMap((arg, index) => arg === "--instance" && args[index + 1] ? [args[index + 1] as string] : []);
  const gradeArgs = gradeArguments({
    ...(gold ? { gold: true } : { predictions: required(args, "--predictions") }),
    runId: required(args, "--run-id"),
    ...(option(args, "--workers") ? { workers: Number(option(args, "--workers")) } : {}),
    ...(option(args, "--timeout") ? { timeoutSeconds: Number(option(args, "--timeout")) } : {}),
    ...(option(args, "--task-repo") ? { taskRepo: option(args, "--task-repo") as string } : {}),
    ...(instances.length > 0 ? { instanceIds: instances } : {}),
  });
  return spawnSync("swebench", gradeArgs, { stdio: "inherit" }).status ?? 1;
}

function usage(): void {
  console.log(`pi-scopes SWE-bench Verified adapter

  npm run eval -- doctor
  npm run eval -- prediction --instance ID --model NAME --patch PATCH --out PREDS.jsonl
  npm run eval -- grade --predictions PREDS.jsonl --run-id UNIQUE [--workers N] [--instance ID]
  npm run eval -- smoke-gold --run-id UNIQUE [--task-repo PATH]

smoke-gold evaluates ${GOLD_SMOKE_INSTANCE} with the reference patch.`);
}

async function main(args: string[]): Promise<number> {
  switch (args[0]) {
    case "doctor": return doctor();
    case "prediction": return makePrediction(args.slice(1));
    case "grade": return runGrade(args.slice(1));
    case "smoke-gold": return runGrade(["--instance", GOLD_SMOKE_INSTANCE, ...args.slice(1)], true);
    default:
      usage();
      return args[0] ? 1 : 0;
  }
}

process.exitCode = await main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  return 1;
});
