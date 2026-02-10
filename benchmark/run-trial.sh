#!/usr/bin/env bash
# Run a single benchmark trial
# Usage: run-trial.sh <branch> <trial-number>
set -euo pipefail

BRANCH="${1:?Usage: run-trial.sh <branch> <trial-number>}"
TRIAL="${2:?Usage: run-trial.sh <branch> <trial-number>}"

# Load config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Determine condition name from branch
if [[ "$BRANCH" == "$BENCH_BRANCH_WITH" ]]; then
  CONDITION="with-are"
elif [[ "$BRANCH" == "$BENCH_BRANCH_WITHOUT" ]]; then
  CONDITION="without-are"
else
  echo "ERROR: Unknown branch '$BRANCH'" >&2
  exit 1
fi

echo "=== Trial $TRIAL ($CONDITION) ==="

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

# Run Claude CLI in headless mode
echo "Running Claude CLI on branch $BRANCH..."
CLAUDE_OUTPUT_FILE="$RESULT_DIR/trial-${TRIAL}-raw.json"

set +e
timeout "$BENCH_TIMEOUT" claude -p "$PROMPT" \
  --output-format json \
  --model "$BENCH_MODEL" \
  --max-turns "$BENCH_MAX_TURNS" \
  --max-budget-usd "$BENCH_MAX_BUDGET_USD" \
  --no-session-persistence \
  --allowedTools "$BENCH_ALLOWED_TOOLS" \
  --dangerously-skip-permissions \
  > "$CLAUDE_OUTPUT_FILE" 2>/dev/null
CLAUDE_EXIT=$?
set -e

# Record end time
END_NS=$(date +%s%N)
WALL_CLOCK_MS=$(( (END_NS - START_NS) / 1000000 ))

echo "Claude exited with code $CLAUDE_EXIT in ${WALL_CLOCK_MS}ms"

# Parse Claude JSON output to extract metrics
METRICS=$(node -e "
const fs = require('fs');
const raw = fs.readFileSync('$CLAUDE_OUTPUT_FILE', 'utf-8').trim();

// Find the result event from Claude CLI streaming JSON output.
// Format is a JSON array of events: [{type:'system',...},{type:'assistant',...},...,{type:'result',...}]
// Or NDJSON lines. We need the object with type === 'result'.
let result;
try {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    result = parsed.find(e => e.type === 'result');
  } else if (parsed.type === 'result') {
    result = parsed;
  } else {
    result = parsed; // single object fallback
  }
} catch {
  // Try NDJSON — find line with type: result
  const lines = raw.split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'result') { result = obj; break; }
    } catch {}
  }
  // Fallback: last valid line
  if (!result) {
    for (let i = lines.length - 1; i >= 0; i--) {
      try { result = JSON.parse(lines[i]); break; } catch {}
    }
  }
}

if (!result) {
  console.log(JSON.stringify({
    num_turns: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    total_cost_usd: 0,
    parse_error: true
  }));
  process.exit(0);
}

const usage = result.usage || {};
console.log(JSON.stringify({
  num_turns: result.num_turns || 0,
  input_tokens: usage.input_tokens || 0,
  output_tokens: usage.output_tokens || 0,
  cache_read_tokens: usage.cache_read_input_tokens || 0,
  cache_creation_tokens: usage.cache_creation_input_tokens || 0,
  total_cost_usd: result.total_cost_usd || 0,
  parse_error: false
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
  condition: '$CONDITION',
  trial: $TRIAL,
  branch: '$BRANCH',
  claude_exit_code: $CLAUDE_EXIT,
  wall_clock_ms: $WALL_CLOCK_MS,
  num_turns: metrics.num_turns,
  input_tokens: metrics.input_tokens,
  output_tokens: metrics.output_tokens,
  cache_read_tokens: metrics.cache_read_tokens,
  cache_creation_tokens: metrics.cache_creation_tokens,
  total_tokens: metrics.input_tokens + metrics.output_tokens,
  total_cost_usd: metrics.total_cost_usd,
  verification: verify,
  parse_error: metrics.parse_error,
  timestamp: new Date().toISOString()
};
const fs = require('fs');
fs.writeFileSync('$RESULT_DIR/trial-${TRIAL}.json', JSON.stringify(result, null, 2));
console.log('Result written to $RESULT_DIR/trial-${TRIAL}.json');
"

echo "=== Trial $TRIAL ($CONDITION) complete ==="
