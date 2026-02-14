# 10 Tips for Getting the Best Documentation from ARE

You've installed agents-reverse-engineer (ARE) and run generate, but the output disappoints. The difference between mediocre and exceptional documentation comes down to how you use the tool. Here are 10 practical tips.

## 1. Structure Code for Better Summaries

Single-responsibility files produce better `.sum` files than kitchen-sink modules. When a file does five things, summaries become vague. Split code into focused files like `jwt-token-validator.ts`, `password-hasher.ts`, and `date-formatter.ts` instead of one `utils.ts`. You'll get sharp, specific summaries. That's also good software design.

## 2. Use Meaningful Names

ARE's AI reads your function, class, and file names to understand code. A file named `utils.ts` produces generic summaries because the name conveys nothing. Name it `jwt-token-validator.ts` and the AI has context before reading code. The same applies to exports: `export function process(data)` tells the AI nothing, while `export function validateUserRegistration(userData)` tells it everything.

## 3. Exclude the Noise

Don't let ARE analyze everything. Test fixtures, generated code, migrations, and vendored dependencies create noise. Add patterns to `.agents-reverse-engineer/config.yaml`:

```yaml
exclude:
  patterns:
    - "**/__fixtures__/**"
    - "**/*.generated.ts"
    - "**/migrations/**"
    - "**/vendor/**"
```

Less noise equals better signal.

## 4. Choose the Right Model

ARE supports multiple AI models. Use `sonnet` (default) for most codebases. Use `haiku` for large projects needing speed. Use `opus` for complex, critical code. Specify with `--model haiku` or in config.yaml.

## 5. Review and Edit .sum Files

Generated `.sum` files are starting points. If ARE misses the point, edit manually. ARE won't overwrite edits unless source files change or you use `--force`.

## 6. Leverage AGENTS.local.md

Put custom instructions in `AGENTS.local.md` at any directory level. ARE preserves it by injecting an `@AGENTS.local.md` directive, merging your guidance with generated documentation.

## 7. Tune Compression for Large Files

ARE automatically compresses documentation for large files. If summaries feel sparse, adjust compression settings in config.yaml.

## 8. Run Quality Checks

Review ARE's quality reports. Code-vs-doc checks find undocumented exports. Code-vs-code checks find duplicate symbols. Phantom-path validation catches broken links.

## 9. Use --trace for Large Projects

When things feel slow, use `--trace` to write detailed logs to `.agents-reverse-engineer/traces/`. Identify bottlenecks and debug failures.

## 10. Iterate, Don't Perfectionist

The first run won't be perfect. Run ARE, review output, adjust exclusions and config, then regenerate. After 2-3 iterations, you'll have genuinely useful documentation.
