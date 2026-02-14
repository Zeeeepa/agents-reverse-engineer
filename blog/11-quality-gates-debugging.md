# Quality Gates and Debugging: ARE's Built-in Validation System

Generated documentation is only valuable if it's accurate. A beautifully formatted AGENTS.md file that references non-existent functions or misses critical exports creates more problems than it solves. This is why agents-reverse-engineer includes a multi-layered validation system that catches common issues automatically.

## The Five Execution Phases

ARE executes five distinct phases during generation:

1. **pre-phase-1-cache**: Reads existing `.sum` files to establish a baseline
2. **phase-1-files**: Parallel AI calls to generate individual `.sum` files
3. **post-phase-1-quality**: Validation checks on file-level documentation
4. **phase-2-dirs**: Post-order aggregation to build `AGENTS.md` files
5. **post-phase-2**: Validation checks on aggregated documentation

Quality checks run after file analysis and directory aggregation, catching issues early before they propagate up the directory tree.

## Post-Phase-1: Code-vs-Doc Checks

After all `.sum` files are generated, ARE scans your source code and compares it against the documentation. The `checkCodeVsDoc()` function ensures every exported symbol appears in the corresponding `.sum` file.

If a symbol exists in code but isn't mentioned in the `.sum` file, ARE flags it as an undocumented export. This matters because AI assistants reading your AGENTS.md won't know about these capabilities.

The `checkCodeVsCode()` function catches duplicate symbols across files. While TypeScript's module system prevents runtime conflicts, these naming collisions can confuse AI assistants.

## Post-Phase-2: Phantom Path Validation

After directory aggregation, ARE runs phantom path detection to ensure every path referenced in AGENTS.md files actually exists. The validator scans for markdown links, backtick paths, and prose references.

For each path, ARE uses dual-resolution: trying relative to the AGENTS.md file location and relative to project root. It also handles TypeScript-specific scenarios, substituting `.ts` for `.js` extensions.

## Reading the Quality Report

Validation findings are categorized by severity: ERROR for critical problems like phantom paths, WARN for issues needing review like undocumented exports, and INFO for informational findings. The report appears at the end of generation.

## The --debug and --trace Flags

When something doesn't look right, the `--debug` flag reveals backend selection, configuration values, full prompts sent to the AI, and response metadata including token counts.

```bash
npx agents-reverse-engineer generate --debug
```

For deeper investigation, use `--trace` to write NDJSON event logs capturing subprocess spawns, exits, retries, and task completions:

```bash
npx agents-reverse-engineer generate --trace
```

## Run Logs and Retry Behavior

After each generation, ARE writes detailed logs to `.agents-reverse-engineer/logs/run-{timestamp}.json` containing prompts, responses, token counts, cache statistics, and latency data. By default, the 50 most recent logs are retained.

ARE retries only rate limit errors using exponential backoff. Timeouts are NOT retried since struggling subprocesses will likely timeout again.

## Troubleshooting Common Issues

All tasks failed? Check if the AI backend CLI is installed. Timeout errors? Increase `ai.timeoutMs` in config or split large files. Rate limit errors? Reduce concurrency. Empty `.sum` files? Check debug output for prompts and responses.
