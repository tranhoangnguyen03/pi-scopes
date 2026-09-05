# SWE-bench Verified evaluation

The first benchmark target is SWE-bench Verified. Keep the inference experiment separate from the official grader: pi-scopes produces a repository patch, this adapter writes the standard prediction record, and SWE-bench runs the project tests.

## Environment

Use Linux x86_64 when possible. The official harness currently recommends at least 120 GB free disk, 16 GB RAM, and 8 CPU cores. ARM64 support is experimental; on an M-series Mac, clone the task repository and pass `--task-repo` so Docker Buildx builds locally.

```sh
python -m venv .venv-swebench
. .venv-swebench/bin/activate
python -m pip install -r evals/requirements.txt
git clone --depth 1 https://github.com/SWE-bench/swe-bench-tasks.git ../swe-bench-tasks
npm run eval -- doctor
```

Validate the grader with one official gold patch before spending model tokens:

```sh
npm run eval -- smoke-gold \
  --run-id gold-smoke-001 \
  --task-repo ../swe-bench-tasks
```

## First experiment

Start with five fixed Verified instances. For each instance, run two clean checkouts at the benchmark base commit using the same Pi version, model, thinking level, prompt, token budget, timeout, and machine:

1. Control: Pi without pi-scopes.
2. Treatment: Pi with pi-scopes available; the parent may fork at most one child.

Record the final patch plus wall time, input/output/cache tokens, cost, child count, capsule status, and trace reference. Never give the gold fix or gold test patch to the agent.

Convert a checkout's diff into the official JSONL shape:

```sh
git diff --binary > /tmp/task.patch
npm run eval -- prediction \
  --instance django__django-11099 \
  --model pi-scopes-treatment \
  --patch /tmp/task.patch \
  --out evals/runs/pilot-treatment.jsonl
```

Grade it with a unique run ID:

```sh
npm run eval -- grade \
  --predictions evals/runs/pilot-treatment.jsonl \
  --run-id pi-scopes-treatment-001 \
  --workers 1 \
  --task-repo ../swe-bench-tasks
```

SWE-bench caches by run ID and instance ID. Use a new run ID whenever a patch changes. Scale from 5 to 25, then to all 500 only after the pilot shows correct checkout isolation, patch capture, and trace/metric completeness.
