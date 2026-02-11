# OpenCode JSON Output Format

## Overview

OpenCode CLI with `--format json` outputs NDJSON (newline-delimited JSON) where each line is a separate event.

## Key Event Types

### `step_finish` / `step-finish`

Contains token usage and cost information for each assistant turn.

**Structure:**
```json
{
  "type": "step_finish",
  "timestamp": 1770850185921,
  "sessionID": "ses_3b11bfdcdffeITCXse4fCuIRnU",
  "part": {
    "id": "prt_c4ee572a4001D80xZeY1SOIMPE",
    "sessionID": "ses_3b11bfdcdffeITCXse4fCuIRnU",
    "messageID": "msg_c4ee5514f001Ex6uD1OPYN4CvM",
    "type": "step-finish",
    "reason": "tool-calls",
    "snapshot": "46358aa58bd4898e237354989cb72e503432508e",
    "cost": 0,
    "tokens": {
      "total": 32790,
      "input": 1,
      "output": 309,
      "reasoning": 0,
      "cache": {
        "read": 31448,
        "write": 1032
      }
    }
  }
}
```

**Key Fields:**
- `part.tokens.input`: Input tokens for this turn
- `part.tokens.output`: Output tokens for this turn
- `part.tokens.reasoning`: Reasoning tokens (extended thinking)
- `part.tokens.cache.read`: Tokens read from cache
- `part.tokens.cache.write`: Tokens written to cache
- `part.cost`: Cost in USD (often 0, needs manual calculation)

### Other Event Types

- `step_start` / `step-start`: Turn begins
- `text`: Assistant text output
- `tool_use`: Tool call execution
- `tool_result`: Tool result

## Parsing Strategy

To extract metrics from OpenCode JSON output:

1. **Count turns**: Count `step_finish` events
2. **Aggregate tokens**: Sum token fields across all `step_finish` events
3. **Calculate cost**: If `cost` field is 0, calculate manually using Anthropic pricing:
   - Input: $15/MTok
   - Output: $75/MTok
   - Cache write: $18.75/MTok
   - Cache read: $1.50/MTok

## Example Parsing Code

```javascript
const fs = require('fs');
const raw = fs.readFileSync('output.json', 'utf-8').trim();

let numTurns = 0;
let inputTokens = 0;
let outputTokens = 0;
let reasoningTokens = 0;
let cacheReadTokens = 0;
let cacheWriteTokens = 0;
let totalCostUsd = 0;

const lines = raw.split('\n').filter(l => l.trim());

for (const line of lines) {
  try {
    const event = JSON.parse(line);

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

      if (event.part?.cost !== undefined) {
        totalCostUsd += event.part.cost;
      }
    }
  } catch (e) {
    // Skip invalid lines
  }
}

// Calculate cost if OpenCode doesn't provide it
if (totalCostUsd === 0 && (inputTokens > 0 || outputTokens > 0)) {
  const inputCost = (inputTokens / 1000000) * 15;
  const outputCost = (outputTokens / 1000000) * 75;
  const cacheWriteCost = (cacheWriteTokens / 1000000) * 18.75;
  const cacheReadCost = (cacheReadTokens / 1000000) * 1.50;
  totalCostUsd = inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

console.log({
  num_turns: numTurns,
  input_tokens: inputTokens,
  output_tokens: outputTokens,
  reasoning_tokens: reasoningTokens,
  cache_read_tokens: cacheReadTokens,
  cache_write_tokens: cacheWriteTokens,
  total_cost_usd: totalCostUsd
});
```

## Example Metrics

From a real trial (adding due date feature to a TODO app):

```
Turns: 28
Input tokens: 29
Output tokens: 10,474
Reasoning tokens: 0
Cache read: 806,897
Cache write: 45,034
Total cost: $2.841
```

## References

- [OpenCode CLI Documentation](https://opencode.ai/docs/cli/)
- [OpenCode GitHub Repository](https://github.com/opencode-ai/opencode)
- [ccusage - OpenCode usage analyzer](https://ccusage.com/guide/opencode/)

## Sources

- [CLI | OpenCode](https://opencode.ai/docs/cli/)
- [GitHub - opencode-ai/opencode](https://github.com/opencode-ai/opencode)
- [OpenCode CLI Overview (Beta) | ccusage](https://ccusage.com/guide/opencode/)
