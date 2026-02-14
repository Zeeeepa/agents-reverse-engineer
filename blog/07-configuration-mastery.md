# Configuration Mastery: Tuning ARE for Your Project

Agents-reverse-engineer (ARE) works great out of the box with intelligent defaults, but tuning the configuration can dramatically improve results for your specific project. This guide covers every setting in `.agents-reverse-engineer/config.yaml` and provides practical recommendations.

## The Config File

Configuration lives in `.agents-reverse-engineer/config.yaml` at your project root, created when you run `are init`. Every field is optional, with sensible defaults if omitted.

## Exclusion Patterns

The `exclude` section controls which files and directories ARE analyzes. Add custom glob patterns to exclude irrelevant files:

```yaml
exclude:
  patterns:
    - "**/*.test.ts"
    - "test-fixtures/**"
    - "migrations/**"
    - "generated/**"
```

Patterns use gitignore syntax. Vendor directories are skipped entirely during discovery for better performance:

```yaml
exclude:
  vendorDirs:
    - node_modules
    - dist
    - __pycache__
    - target
```

Binary files can't be analyzed as text, so ARE skips them automatically.

## Concurrency Tuning

Concurrency controls how many AI subprocess calls run in parallel. By default, ARE calculates this based on your system:

```javascript
concurrency = min(20, floor(totalMemGB * 0.5 / 0.512), max(2, os.availableParallelism() * 5))
```

Increase concurrency when you have abundant RAM and aren't hitting rate limits. Decrease when encountering rate limits or running low on memory.

## Timeout Management

The `timeoutMs` setting controls how long ARE waits for each AI subprocess. Default is five minutes. Increase for very large files or complex code. Decrease for faster failure with small files. Timeouts are not retried.

## Model Selection

The `model` field lets you choose which AI model to use. Default is `sonnet` for balanced performance. Available options: `sonnet`, `opus` for highest quality, `haiku` for fastest speed. Override per run with `--model`.

## Compression Ratio

The `compressionRatio` setting controls target `.sum` file size relative to source file size:

- 0.10: Very aggressive, risks omitting details
- 0.25: Balanced compression (default)
- 0.50: Verbose documentation

Critical content like regex patterns and magic constants are automatically extracted to `.annex.sum` files that bypass compression.

## Project-Specific Recommendations

**Small Projects (<50 files):** Use defaults.

**Medium Projects (50-500 files):** Exclude test files and fixtures, use concurrency fifteen, sonnet model, 0.25 compression.

**Large Projects (500+ files):** Be aggressive with exclusions, use max concurrency, consider haiku for cost efficiency, use 0.20 compression. Monitor for rate-limit errors and use `--trace` on first run.
