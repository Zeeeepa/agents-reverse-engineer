#!/usr/bin/env bash
# Orchestrate all 6 benchmark trials
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config-claudecode.sh"

echo "=== ARE E2E Benchmark ==="
echo "Task: $BENCH_TASK"
echo "Trials per condition: $BENCH_TRIALS"
echo "Model: $BENCH_MODEL"
echo "Max turns: $BENCH_MAX_TURNS"
echo "Budget cap: \$$BENCH_MAX_BUDGET_USD per trial"
echo ""

# Verify setup
if [[ ! -d "$BENCH_TEST_REPO/.git" ]]; then
  echo "ERROR: Test repo not found. Run 'bash benchmark/setup.sh' first." >&2
  exit 1
fi

cd "$BENCH_TEST_REPO"

for BRANCH in "$BENCH_BRANCH_WITHOUT" "$BENCH_BRANCH_WITH"; do
  if ! git rev-parse --verify "$BRANCH" &>/dev/null; then
    echo "ERROR: Branch $BRANCH not found. Run 'bash benchmark/setup.sh' first." >&2
    exit 1
  fi
done

echo "Setup verified. Starting benchmark..."
echo ""

# Run without-are trials
echo ">>> Condition: WITHOUT ARE <<<"
for i in $(seq 1 "$BENCH_TRIALS"); do
  bash "$SCRIPT_DIR/run-trial-claudecode.sh" "$BENCH_BRANCH_WITHOUT" "$i"
  if [[ "$i" -lt "$BENCH_TRIALS" ]]; then
    echo "Cooling down for 30s..."
    sleep 30
  fi
done

echo ""

# Run with-are trials
echo ">>> Condition: WITH ARE <<<"
for i in $(seq 1 "$BENCH_TRIALS"); do
  bash "$SCRIPT_DIR/run-trial-claudecode.sh" "$BENCH_BRANCH_WITH" "$i"
  if [[ "$i" -lt "$BENCH_TRIALS" ]]; then
    echo "Cooling down for 30s..."
    sleep 30
  fi
done

echo ""
echo "=== All trials complete. Generating analysis... ==="

# Run analysis (export config vars for analyze.ts)
export BENCH_MODEL BENCH_TASK
npx tsx "$SCRIPT_DIR/analyze-claudecode.ts"

echo ""
echo "Results: $BENCH_RESULTS/summary.md"
