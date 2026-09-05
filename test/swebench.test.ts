import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gradeArguments, prediction, upsertPrediction } from "../evals/swebench.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SWE-bench adapter", () => {
  it("builds current v5 Verified CLI arguments", () => {
    expect(gradeArguments({
      predictions: "predictions.jsonl",
      runId: "treatment-001",
      workers: 2,
      taskRepo: "../tasks",
      instanceIds: ["django__django-11099"],
    })).toEqual([
      "eval", "verified",
      "-p", path.resolve("predictions.jsonl"),
      "--run-id", "treatment-001",
      "--workers", "2",
      "--timeout", "1800",
      "--task-repo", path.resolve("../tasks"),
      "--instance", "django__django-11099",
    ]);
  });

  it("upserts one standard JSONL record per instance", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "pi-scopes-eval-"));
    temporaryDirectories.push(directory);
    const output = path.join(directory, "predictions.jsonl");
    await upsertPrediction(output, prediction("b", "control", "old"));
    await upsertPrediction(output, prediction("a", "control", "patch-a"));
    await upsertPrediction(output, prediction("b", "treatment", "patch-b"));

    const records = (await readFile(output, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(records).toEqual([
      { instance_id: "a", model_name_or_path: "control", model_patch: "patch-a" },
      { instance_id: "b", model_name_or_path: "treatment", model_patch: "patch-b" },
    ]);
  });
});
