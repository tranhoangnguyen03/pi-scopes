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

`doctor` checks CLI availability, not Docker daemon health or the installed SWE-bench version. Also verify `docker info`, `python -c "from importlib.metadata import version; print(version('swebench'))"` (must be 5.0.2, using the grader's Python environment), and the task checkout before proceeding. The adapter does not install or start these services.

Validate the grader with one official gold patch before spending model tokens:

```sh
npm run eval -- smoke-gold \
  --run-id gold-smoke-001 \
  --task-repo ../swe-bench-tasks
```

## Current evaluation policy

Future paid test models: **`zai/glm-5.3-flash` or `zai/glm-5.3`**, per owner preference. Verify availability and pricing before launch; record the exact model and supported thinking settings. Do not silently fall back to Terra/Codex. Historical Terra runs remain unchanged.

Judge **task output quality versus combined parent-plus-child estimated dollar cost**. Resolution, verification, useful findings, and retained parent context matter; cumulative token count is not a success criterion.

- Report best-effort dollar estimates with their pricing source. Catalogue prices are not OAuth subscription invoices. Unknown pricing or missing usage means unavailable/incomplete, not free.
- Always retain uncached input, cache-read input, cache-write input when supplied, and output tokens. Prefer the provider-normalized Pi usage fields; do not count cached input twice or add reasoning tokens again when included in output.
- Report input cache-hit rate as `cacheRead / (input + cacheRead + cacheWrite)` when all fields are available and the denominator is positive. This measures input reuse, not useful work: unnecessary repeated investigation can also be highly cached.
- Future inference checks have **no cumulative-token cutoff**. Dollar thresholds are soft guidance: report crossing them, not automatic task failure. Preserve explicit wall-time/cancellation safeguards and the child investigation allowance. Predeclare any actual hard spending cap separately; soft guidance does not authorize unlimited unattended spending.
- Preserve frozen historical runners, manifests, and results. Their token-stop failures remain factual records of those experiments, not the policy for future checks.

## Paired experiment

Select a small fixed set of Verified instances. For each instance, run two clean checkouts at the benchmark base commit using the same Pi version, model, thinking level, prompt, soft spending guidance, timeout, and machine:

1. Control: Pi without pi-scopes.
2. Treatment: Pi with pi-scopes available; the parent may fork at most one child.

Record the final patch plus wall time, input/output/cache tokens, cost, child count, capsule status, and trace reference. Never give the gold fix or gold test patch to the agent.

Before inference, save a run manifest with instance IDs and base commits, Pi/pi-scopes revisions, model/provider, thinking level, exact prompt, enabled work tools, shared soft dollar guidance, explicit hard limits (if any), timeout, and machine details. Distinguish reporting thresholds from enforced limits and record the one-child-per-task policy; this adapter does not enforce them.

Use **combined parent-plus-child** totals. Pi-scopes returns child inference as nested tool usage, so Pi's parent session totals already include it: do not add capsule usage a second time. Keep separate child usage from the saved capsule for diagnostics, and flag failed runs with missing usage as incomplete rather than zero-cost. Record parent context size before/after delegation separately from cumulative billed tokens.

This adapter only writes predictions and invokes the grader. It does not automate paired inference, create clean checkouts, capture manifests, or enforce budgets. The [first one-task paired pilot](results/2026-09-05-terra-high-pilot.md) used a separate recorded runner: both arms resolved the task, with lower parent context but higher time and estimated cost for scopes.

The [harder-task context study](results/2026-09-05-terra-high-context-study.md) exposed the next limit: all three scoped investigations exhausted the shared token budget without returning useful findings. Baseline resolved 1/3; scopes 0/3. Context isolation alone is not task success.

After adding bounded investigation, a [single Django acceptance check](results/2026-09-06-bounded-investigation-check.md) returned useful partial findings and resolved the task. It resolved the task at approximately **$0.396 combined catalogue-equivalent cost**, with **86.6% cached input**. The historical run exceeded its nominal token threshold by 3.3%; under the current policy this is a diagnostic, not a quality failure. This was not a new paired benchmark.

The [three-phase follow-up check](results/2026-09-06-followup-context-check.md) resolved the task and answered the final follow-up without tools at $0.700 combined estimate. However, the thin child capsule led to substantial parent re-investigation beforehand; no compaction or comparative context-saving claim is established.

The [GLM retrieval-usability check](results/2026-09-06-glm-retrieval-usability.md) correctly recovered a synthetic recorded result via `scope` at an estimated $0.00051. Navigation worked without repair, but small output pages required four reads; this is a usability observation, not task-resolution evidence.

Convert a checkout's diff into the official JSONL shape:

```sh
# In the task checkout, include new solution files with git add -N <paths> first.
git diff --binary HEAD > /tmp/task.patch

# Back in the pi-scopes checkout:
mkdir -p evals/runs
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
