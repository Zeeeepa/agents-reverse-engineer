# Documentation Generation Plan

Generated: 2026-02-09
Project: /home/pascal/wks/agents-reverse-engineer

## Summary

- **Total Tasks**: 124
- **File Tasks**: 95
- **Directory Tasks**: 28
- **Root Tasks**: 1
- **Traversal**: Post-order (children before parents)

---

## Phase 1: File Analysis (Post-Order Traversal)

### Depth 3: src/ai/backends/ (3 files)
- [x] `src/ai/backends/claude.ts`
- [x] `src/ai/backends/gemini.ts`
- [x] `src/ai/backends/opencode.ts`

### Depth 3: src/ai/telemetry/ (3 files)
- [x] `src/ai/telemetry/cleanup.ts`
- [x] `src/ai/telemetry/logger.ts`
- [x] `src/ai/telemetry/run-log.ts`

### Depth 3: src/discovery/filters/ (5 files)
- [x] `src/discovery/filters/binary.ts`
- [x] `src/discovery/filters/custom.ts`
- [x] `src/discovery/filters/gitignore.ts`
- [x] `src/discovery/filters/index.ts`
- [x] `src/discovery/filters/vendor.ts`

### Depth 3: src/generation/prompts/ (4 files)
- [x] `src/generation/prompts/builder.ts`
- [x] `src/generation/prompts/index.ts`
- [x] `src/generation/prompts/templates.ts`
- [x] `src/generation/prompts/types.ts`

### Depth 3: src/generation/writers/ (3 files)
- [x] `src/generation/writers/agents-md.ts`
- [x] `src/generation/writers/index.ts`
- [x] `src/generation/writers/sum.ts`

### Depth 3: src/quality/density/ (1 files)
- [x] `src/quality/density/validator.ts`

### Depth 3: src/quality/inconsistency/ (3 files)
- [x] `src/quality/inconsistency/code-vs-code.ts`
- [x] `src/quality/inconsistency/code-vs-doc.ts`
- [x] `src/quality/inconsistency/reporter.ts`

### Depth 3: src/quality/phantom-paths/ (2 files)
- [x] `src/quality/phantom-paths/index.ts`
- [x] `src/quality/phantom-paths/validator.ts`

### Depth 2: .github/workflows/ (1 files)
- [x] `.github/workflows/publish.yml`

### Depth 2: src/ai/ (6 files)
- [x] `src/ai/index.ts`
- [x] `src/ai/registry.ts`
- [x] `src/ai/retry.ts`
- [x] `src/ai/service.ts`
- [x] `src/ai/subprocess.ts`
- [x] `src/ai/types.ts`

### Depth 2: src/change-detection/ (3 files)
- [x] `src/change-detection/detector.ts`
- [x] `src/change-detection/index.ts`
- [x] `src/change-detection/types.ts`

### Depth 2: src/config/ (3 files)
- [x] `src/config/defaults.ts`
- [x] `src/config/loader.ts`
- [x] `src/config/schema.ts`

### Depth 2: src/cli/ (7 files)
- [x] `src/cli/clean.ts`
- [x] `src/cli/discover.ts`
- [x] `src/cli/generate.ts`
- [x] `src/cli/index.ts`
- [x] `src/cli/init.ts`
- [x] `src/cli/specify.ts`
- [x] `src/cli/update.ts`

### Depth 2: src/discovery/ (3 files)
- [x] `src/discovery/run.ts`
- [x] `src/discovery/types.ts`
- [x] `src/discovery/walker.ts`

### Depth 2: src/generation/ (5 files)
- [x] `src/generation/collector.ts`
- [x] `src/generation/complexity.ts`
- [x] `src/generation/executor.ts`
- [x] `src/generation/orchestrator.ts`
- [x] `src/generation/types.ts`

### Depth 2: src/imports/ (3 files)
- [x] `src/imports/extractor.ts`
- [x] `src/imports/index.ts`
- [x] `src/imports/types.ts`

### Depth 2: src/installer/ (7 files)
- [x] `src/installer/banner.ts`
- [x] `src/installer/index.ts`
- [x] `src/installer/operations.ts`
- [x] `src/installer/paths.ts`
- [x] `src/installer/prompts.ts`
- [x] `src/installer/types.ts`
- [x] `src/installer/uninstall.ts`

### Depth 2: src/integration/ (4 files)
- [x] `src/integration/detect.ts`
- [x] `src/integration/generate.ts`
- [x] `src/integration/templates.ts`
- [x] `src/integration/types.ts`

### Depth 2: src/orchestration/ (7 files)
- [x] `src/orchestration/index.ts`
- [x] `src/orchestration/plan-tracker.ts`
- [x] `src/orchestration/pool.ts`
- [x] `src/orchestration/progress.ts`
- [x] `src/orchestration/runner.ts`
- [x] `src/orchestration/trace.ts`
- [x] `src/orchestration/types.ts`

### Depth 2: src/output/ (1 files)
- [x] `src/output/logger.ts`

### Depth 2: src/quality/ (2 files)
- [x] `src/quality/index.ts`
- [x] `src/quality/types.ts`

### Depth 2: src/specify/ (3 files)
- [x] `src/specify/index.ts`
- [x] `src/specify/prompts.ts`
- [x] `src/specify/writer.ts`

### Depth 2: src/types/ (1 files)
- [x] `src/types/index.ts`

### Depth 2: src/update/ (4 files)
- [x] `src/update/index.ts`
- [x] `src/update/orchestrator.ts`
- [x] `src/update/orphan-cleaner.ts`
- [x] `src/update/types.ts`

### Depth 1: docs/ (1 files)
- [x] `docs/INPUT.md`

### Depth 1: hooks/ (4 files)
- [x] `hooks/are-check-update.js`
- [x] `hooks/are-session-end.js`
- [x] `hooks/opencode-are-check-update.js`
- [x] `hooks/opencode-are-session-end.js`

### Depth 1: scripts/ (1 files)
- [x] `scripts/build-hooks.js`

### Depth 0: ./ (5 files)
- [x] `LANGUAGES-MANIFEST.md`
- [x] `LICENSE`
- [x] `README.md`
- [x] `package.json`
- [x] `tsconfig.json`

---

## Phase 2: Directory AGENTS.md (Post-Order Traversal, 28 directories)

### Depth 3
- [x] `src/ai/backends/AGENTS.md`
- [x] `src/ai/telemetry/AGENTS.md`
- [x] `src/discovery/filters/AGENTS.md`
- [x] `src/generation/prompts/AGENTS.md`
- [x] `src/generation/writers/AGENTS.md`
- [x] `src/quality/density/AGENTS.md`
- [x] `src/quality/inconsistency/AGENTS.md`
- [x] `src/quality/phantom-paths/AGENTS.md`

### Depth 2
- [x] `.github/workflows/AGENTS.md`
- [x] `src/ai/AGENTS.md`
- [x] `src/change-detection/AGENTS.md`
- [x] `src/config/AGENTS.md`
- [x] `src/cli/AGENTS.md`
- [x] `src/discovery/AGENTS.md`
- [x] `src/generation/AGENTS.md`
- [x] `src/imports/AGENTS.md`
- [x] `src/installer/AGENTS.md`
- [x] `src/integration/AGENTS.md`
- [x] `src/orchestration/AGENTS.md`
- [x] `src/output/AGENTS.md`
- [x] `src/quality/AGENTS.md`
- [x] `src/specify/AGENTS.md`
- [x] `src/types/AGENTS.md`
- [x] `src/update/AGENTS.md`

### Depth 1
- [x] `docs/AGENTS.md`
- [x] `hooks/AGENTS.md`
- [x] `scripts/AGENTS.md`

### Depth 0
- [x] `./AGENTS.md` (root)

---

## Phase 3: Root Documents

- [x] `CLAUDE.md`
