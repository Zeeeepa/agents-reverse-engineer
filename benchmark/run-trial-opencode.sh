#!/usr/bin/env bash
# Run a single benchmark trial with OpenCode
# Usage: run-trial-opencode.sh <branch> <trial-number>
set -euo pipefail

BRANCH="${1:?Usage: run-trial-opencode.sh <branch> <trial-number>}"
TRIAL="${2:?Usage: run-trial-opencode.sh <branch> <trial-number>}"

# Load config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config-opencode.sh"

# Determine condition name from branch
if [[ "$BRANCH" == "$BENCH_BRANCH_WITH" ]]; then
  CONDITION="with-are"
elif [[ "$BRANCH" == "$BENCH_BRANCH_WITHOUT" ]]; then
  CONDITION="without-are"
else
  echo "ERROR: Unknown branch '$BRANCH'" >&2
  exit 1
fi

echo "=== Trial $TRIAL ($CONDITION) with OpenCode ==="

# Ensure results directory exists
RESULT_DIR="$BENCH_RESULTS/$CONDITION"
mkdir -p "$RESULT_DIR"

# Clean workspace to known state
cd "$BENCH_TEST_REPO"
git checkout "$BRANCH"
git reset --hard
git clean -fd

# Read prompt
PROMPT=$(cat "$BENCH_PROMPT_FILE")

# Record start time (nanoseconds)
START_NS=$(date +%s%N)

# Run OpenCode CLI in headless mode
echo "Running OpenCode CLI on branch $BRANCH..."
OPENCODE_OUTPUT_FILE="$RESULT_DIR/trial-${TRIAL}-raw.json"

set +e
timeout "$BENCH_TIMEOUT" opencode run "$PROMPT" \
  --format json \
  --model "$BENCH_MODEL" \
  > "$OPENCODE_OUTPUT_FILE" 2>/dev/null
OPENCODE_EXIT=$?
set -e

# Record end time
END_NS=$(date +%s%N)
WALL_CLOCK_MS=$(( (END_NS - START_NS) / 1000000 ))

echo "OpenCode exited with code $OPENCODE_EXIT in ${WALL_CLOCK_MS}ms"

# Parse OpenCode JSON output to extract metrics
# OpenCode outputs NDJSON with step_finish events containing token usage
METRICS=$(node -e "
const fs = require('fs');
const raw = fs.readFileSync('$OPENCODE_OUTPUT_FILE', 'utf-8').trim();

let numTurns = 0;
let inputTokens = 0;
let outputTokens = 0;
let reasoningTokens = 0;
let cacheReadTokens = 0;
let cacheWriteTokens = 0;
let totalCostUsd = 0;
let parseError = false;

try {
  const lines = raw.split('\n').filter(l => l.trim());

  for (const line of lines) {
    try {
      const event = JSON.parse(line);

      // Count turns from step-finish events and extract token usage
      if (event.type === 'step_finish' || event.part?.type === 'step-finish') {
        numTurns++;

        const tokens = event.part?.tokens;
        if (tokens) {
          inputTokens += tokens.input || 0;
          outputTokens += tokens.output || 0;
          reasoningTokens += tokens.reasoning || 0;
          cacheReadTokens += tokens.cache?.read || 0;
          cacheWriteTokens += tokens.cache?.write || 0;
        }

        // Extract cost (usually 0 in OpenCode, calculate manually if needed)
        if (event.part?.cost !== undefined) {
          totalCostUsd += event.part.cost;
        }
      }
    } catch (e) {
      // Skip invalid lines
    }
  }

  if (lines.length === 0 || numTurns === 0) {
    parseError = true;
  }

  // Calculate cost if OpenCode doesn't provide it (Opus 4.6 pricing as of 2026)
  // Input: \$15/MTok, Output: \$75/MTok, Cache write: \$18.75/MTok, Cache read: \$1.50/MTok
  if (totalCostUsd === 0 && (inputTokens > 0 || outputTokens > 0)) {
    const inputCost = (inputTokens / 1000000) * 15;
    const outputCost = (outputTokens / 1000000) * 75;
    const cacheWriteCost = (cacheWriteTokens / 1000000) * 18.75;
    const cacheReadCost = (cacheReadTokens / 1000000) * 1.50;
    totalCostUsd = inputCost + outputCost + cacheWriteCost + cacheReadCost;
  }
} catch (e) {
  parseError = true;
}

console.log(JSON.stringify({
  num_turns: numTurns,
  input_tokens: inputTokens,
  output_tokens: outputTokens,
  reasoning_tokens: reasoningTokens,
  cache_read_tokens: cacheReadTokens,
  cache_write_tokens: cacheWriteTokens,
  total_cost_usd: totalCostUsd,
  parse_error: parseError
}));
")

echo "Metrics: $METRICS"

# Run verification
echo "Running verification..."
VERIFY_OUTPUT=$("$BENCH_VERIFY_SCRIPT" "$BENCH_TEST_REPO" --json)
echo "Verification: $VERIFY_OUTPUT"

# Assemble final result JSON
node -e "
const metrics = $METRICS;
const verify = $VERIFY_OUTPUT;
const result = {
  runtime: 'opencode',
  condition: '$CONDITION',
  trial: $TRIAL,
  branch: '$BRANCH',
  exit_code: $OPENCODE_EXIT,
  wall_clock_ms: $WALL_CLOCK_MS,
  num_turns: metrics.num_turns,
  input_tokens: metrics.input_tokens,
  output_tokens: metrics.output_tokens,
  reasoning_tokens: metrics.reasoning_tokens,
  cache_read_tokens: metrics.cache_read_tokens,
  cache_creation_tokens: metrics.cache_write_tokens,
  total_tokens: metrics.input_tokens + metrics.output_tokens,
  total_cost_usd: metrics.total_cost_usd,
  verification: verify,
  parse_error: metrics.parse_error,
  timestamp: new Date().toISOString(),
  notes: 'OpenCode does not support --max-turns or --max-budget-usd flags'
};
const fs = require('fs');
fs.writeFileSync('$RESULT_DIR/trial-${TRIAL}.json', JSON.stringify(result, null, 2));
console.log('Result written to $RESULT_DIR/trial-${TRIAL}.json');
"

echo "=== Trial $TRIAL ($CONDITION) complete ==="
