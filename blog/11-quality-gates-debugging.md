# Quality Gates and Debugging: ARE's Built-in Validation System

Generated documentation is only valuable if it's accurate. An AGENTS.md that references non-existent functions or misses critical exports creates more problems than it solves. That's why agents-reverse-engineer includes multi-layered validation.

## The Five Execution Phases

1. **pre-phase-1-cache**: Reads existing `.sum` files for baseline
2. **phase-1-files**: Parallel AI calls generating `.sum` files
3. **post-phase-1-quality**: Validation on file-level documentation
4. **phase-2-dirs**: Post-order aggregation building `AGENTS.md`
5. **post-phase-2**: Validation on aggregated documentation

Quality checks run after each major phase, catching issues before they propagate.

## Post-Phase-1: Code-vs-Doc Checks

`checkCodeVsDoc()` ensures every exported symbol appears in the corresponding `.sum` file. Undocumented exports mean AI assistants won't know about those capabilities.

`checkCodeVsCode()` catches duplicate symbols across files. While TypeScript's module system prevents runtime conflicts, naming collisions confuse AI assistants.

## Post-Phase-2: Phantom Path Validation

After directory aggregation, phantom path detection ensures every path referenced in AGENTS.md actually exists. The validator scans markdown links, backtick paths, and prose references, using dual-resolution (relative to file and project root) with `.js` to `.ts` substitution.

## Reading the Quality Report

Findings are categorized: **ERROR** for critical problems like phantom paths, **WARN** for issues like undocumented exports, **INFO** for informational findings.

## The --debug and --trace Flags

The `--debug` flag reveals backend selection, configuration, prompts sent to the AI, and response metadata:

```bash
npx agents-reverse-engineer generate --debug
```

For deeper investigation, `--trace` writes NDJSON event logs capturing subprocess spawns, exits, retries, and task completions:

```bash
npx agents-reverse-engineer generate --trace
```

## Run Logs

After each generation, ARE writes logs to `.agents-reverse-engineer/logs/` with prompts, responses, tokens, cache stats, and latency. The 50 most recent logs are retained. ARE retries only rate limit errors with exponential backoff — timeouts are NOT retried.

## Troubleshooting

All tasks failed? Check if the AI CLI is installed. Timeouts? Increase `ai.timeoutMs` or split large files. Rate limits? Reduce concurrency. Empty `.sum` files? Check `--debug` output.
