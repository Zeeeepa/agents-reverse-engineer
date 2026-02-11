# ARE E2E Benchmark Results (OpenCode)

**Runtime**: OpenCode
**Generated**: 2026-02-11T23:33:20.963Z
**Trials per condition**: 3

> ⚠️ **OpenCode Limitations**: This benchmark ran with OpenCode, which does not support `--max-turns`, `--max-budget-usd`, or `--allowedTools` flags. Trials may have used more turns/budget than the Claude Code baseline.

## Comparison Summary

| Metric | Without ARE | With ARE | Delta |
|--------|-----------|---------|-------|
| Wall Clock (mean) | 5.1m | 3.5m | -30.6% |
| Turns (mean) | 21.0 | 29.0 | +38.1% |
| Input Tokens (mean) | 49 | 48 | -2.7% |
| Output Tokens (mean) | 11.3k | 10.8k | -4.5% |
| Cache Read Tokens (mean) | 557.8k | 957.6k | +71.7% |
| Total Tokens (mean) | 11.3k | 10.8k | -4.5% |
| Cost USD (mean) | $2.296 | $2.938 | +28.0% |
| Verification Score (mean) | 6.0/7 | 6.0/7 | 0.0% |
| Success Rate | 100.0% | 100.0% | — |

## Interpretation

- **Time (H1)**: With ARE was 30.6% faster on average. ✅ Hypothesis supported.
- **Tokens (H2)**: With ARE used 4.5% fewer total tokens. ✅ Hypothesis supported.
- **Turns (H3)**: With ARE needed 38.1% more turns. ❌ Hypothesis not supported.
- **Quality (H4)**: With ARE scored 0.0 verification points. ➖ No difference.
- **Cache (H5)**: Mean cache read tokens — Without: 557.8k, With: 957.6k.

## Without ARE — Detail

| Metric | Mean | StdDev | Min | Max | Median |
|--------|------|--------|-----|-----|--------|
| Wall Clock | 5.1m | 10.9s | 4.9m | 5.3m | 5.0m |
| Turns | 21.0 | 4.3 | 17.0 | 27.0 | 19.0 |
| Input Tokens | 49 | 10 | 36 | 61 | 51 |
| Output Tokens | 11.3k | 886 | 10.2k | 12.4k | 11.2k |
| Total Tokens | 11.3k | 876 | 10.3k | 12.4k | 11.2k |
| Cost USD | $2.296 | $0.224 | $2.113 | $2.611 | $2.164 |
| Verify Score | 6.0/7 | 0.0 | 6.0 | 6.0 | 6.0 |

### Per-Trial Results

| Trial | Time | Turns | Total Tokens | Cost | Score | Pass? |
|-------|------|-------|-------------|------|-------|-------|
| 1 | 5.3m | 17 | 10.3k | $2.164 | 6/7 | ✅ |
| 2 | 4.9m | 19 | 11.2k | $2.113 | 6/7 | ✅ |
| 3 | 5.0m | 27 | 12.4k | $2.611 | 6/7 | ✅ |

## With ARE — Detail

| Metric | Mean | StdDev | Min | Max | Median |
|--------|------|--------|-----|-----|--------|
| Wall Clock | 3.5m | 27.1s | 2.9m | 3.9m | 3.8m |
| Turns | 29.0 | 4.5 | 23.0 | 34.0 | 30.0 |
| Input Tokens | 48 | 6 | 39 | 53 | 52 |
| Output Tokens | 10.8k | 351 | 10.3k | 11.0k | 11.0k |
| Total Tokens | 10.8k | 348 | 10.3k | 11.1k | 11.1k |
| Cost USD | $2.938 | $0.257 | $2.614 | $3.242 | $2.959 |
| Verify Score | 6.0/7 | 0.0 | 6.0 | 6.0 | 6.0 |

### Per-Trial Results

| Trial | Time | Turns | Total Tokens | Cost | Score | Pass? |
|-------|------|-------|-------------|------|-------|-------|
| 1 | 2.9m | 23 | 10.3k | $2.614 | 6/7 | ✅ |
| 2 | 3.9m | 34 | 11.1k | $3.242 | 6/7 | ✅ |
| 3 | 3.8m | 30 | 11.1k | $2.959 | 6/7 | ✅ |

## Methodology

- **Runtime**: OpenCode CLI
- **Test repo**: htamagnus/to-do-fullstack-nestjs-react (NestJS + React + MySQL + TypeScript)
- **Task**: Due Dates (~5-8 files, mostly modifications to existing code)
- **Model**: anthropic/claude-sonnet-4-5, max-turns observed: 34, max cost observed: $3.24
- **Tools**: All tools available (OpenCode does not support `--allowedTools` restriction)
- **Cooldown**: 30s between trials
- **Verification**: 7-point checklist
- **ARE condition**: Full pipeline (init → discover → generate) committed to branch
- **Limitations**: No turn limit, no budget cap, all tools accessible (OpenCode does not support these flags)
