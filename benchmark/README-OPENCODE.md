# Running Benchmarks with OpenCode

This directory contains OpenCode-compatible versions of the ARE E2E benchmark scripts.

## Differences from Claude Code Benchmark

OpenCode CLI has different capabilities than Claude Code CLI:

| Feature | Claude Code | OpenCode |
|---------|-------------|----------|
| JSON output | `--output-format json` | `--format json` ✅ |
| Model selection | `--model opus` | `--model anthropic/claude-opus-4-6` ✅ |
| Turn limit | `--max-turns 100` ✅ | ❌ Not supported |
| Budget cap | `--max-budget-usd 10` ✅ | ❌ Not supported |
| Tool restrictions | `--allowedTools "Read,Write,..."` ✅ | ❌ Not supported |
| Skip permissions | `--dangerously-skip-permissions` ✅ | ❌ Not needed |

**Important**: OpenCode benchmarks may use more turns and higher costs since these limits cannot be enforced.

## Prerequisites

1. Install OpenCode CLI: Follow instructions at [opencode.sh](https://opencode.sh)
2. Ensure you have the test repository set up: `bash benchmark/setup.sh`

## Configuration

Edit [config-opencode.sh](./config-opencode.sh) to adjust:

- `BENCH_TASK`: Task to benchmark (`"tags"` or `"duedate"`)
- `BENCH_TRIALS`: Number of trials per condition (default: 3)
- `BENCH_MODEL`: Model in `provider/model` format (default: `anthropic/claude-opus-4-6`)
- `BENCH_TIMEOUT`: Wall-clock timeout in seconds (default: 1800 = 30 min)

## Running the Benchmark

Execute the full benchmark (all trials for both conditions):

```bash
bash benchmark/run-benchmark-opencode.sh
```

This will:
1. Run N trials on the "without-are" branch
2. Run N trials on the "with-are" branch
3. Generate analysis in `benchmark/results-opencode/summary.md`

## Running a Single Trial

To run just one trial for testing:

```bash
bash benchmark/run-trial-opencode.sh benchmark/without-are 1
```

Arguments:
- First: Branch name (`benchmark/without-are` or `benchmark/with-are`)
- Second: Trial number (1, 2, 3, ...)

## Output Files

Results are written to `benchmark/results-opencode/`:

```
results-opencode/
├── without-are/
│   ├── trial-1.json         # Metrics + verification
│   ├── trial-1-raw.json     # Raw OpenCode NDJSON output
│   ├── trial-2.json
│   └── ...
├── with-are/
│   ├── trial-1.json
│   └── ...
└── summary.md               # Aggregated analysis
```

## JSON Output Parsing

OpenCode emits NDJSON (newline-delimited JSON) with events like:

```jsonl
{"type":"message","role":"assistant",...}
{"type":"usage","usage":{"input_tokens":123,"output_tokens":456,...}}
```

The trial script aggregates these events to compute total token usage.

**Note**: Cost calculation may be inaccurate if OpenCode doesn't include cost fields in its output.

## Limitations

Due to OpenCode's lack of enforcement flags:

1. **No turn limit**: Trials may run longer than intended
2. **No budget cap**: Costs may exceed the Claude Code baseline
3. **No tool restrictions**: All tools are available (can't restrict to Read/Write/Edit/Bash/Glob/Grep only)

The `BENCH_TIMEOUT` wall-clock limit is still enforced via the `timeout` command.

## Comparing with Claude Code Results

To compare OpenCode results against Claude Code:

1. Run Claude Code benchmark: `bash benchmark/run-benchmark.sh`
2. Run OpenCode benchmark: `bash benchmark/run-benchmark-opencode.sh`
3. Compare:
   - Claude results: `benchmark/results/summary.md`
   - OpenCode results: `benchmark/results-opencode/summary.md`

Keep in mind the limitations above when interpreting differences.

## Troubleshooting

### "No trial results found"

Make sure trials completed successfully. Check for JSON files:
```bash
ls -la benchmark/results-opencode/without-are/
ls -la benchmark/results-opencode/with-are/
```

### "parse_error: true" in results

The OpenCode JSON output couldn't be parsed. Check raw output:
```bash
cat benchmark/results-opencode/without-are/trial-1-raw.json
```

This may indicate:
- OpenCode crashed or was killed
- Output format changed in a new OpenCode version
- Empty or malformed output

### Timeouts

If trials frequently timeout:
1. Increase `BENCH_TIMEOUT` in [config-opencode.sh](./config-opencode.sh)
2. Reduce task complexity
3. Check if OpenCode is hanging (check system resources)

## Scripts

- **[config-opencode.sh](./config-opencode.sh)**: Configuration variables
- **[run-benchmark-opencode.sh](./run-benchmark-opencode.sh)**: Main orchestrator
- **[run-trial-opencode.sh](./run-trial-opencode.sh)**: Single trial runner
- **[analyze-opencode.ts](./analyze-opencode.ts)**: Results aggregation and analysis
