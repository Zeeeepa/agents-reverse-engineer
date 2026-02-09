---
phase: 11-rebuild-command
verified: 2026-02-09T21:30:00Z
status: passed
score: 14/14 must-haves verified
---

# Phase 11: Rebuild Command Verification Report

**Phase Goal:** An `are rebuild` command that reads specification files from `specs/` and reconstructs the project into a `rebuild/` folder, with checkpoint-based progress tracking enabling multi-session execution (context rot mitigation)

**Verified:** 2026-02-09T21:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

#### Plan 11-01 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Spec files in specs/ can be read and partitioned into rebuild units | ✓ VERIFIED | `readSpecFiles()` reads from specs/ dir, `partitionSpec()` extracts Build Plan phases with fallback to top-level headings, both validated via error handling |
| 2 | AI multi-file output with ===FILE:=== delimiters can be parsed into a Map of file paths to contents | ✓ VERIFIED | `parseModuleOutput()` uses regex `/===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g` with fallback to fenced blocks |
| 3 | Checkpoint state can be saved, loaded, and validated with spec drift detection | ✓ VERIFIED | `CheckpointManager.load()` validates with Zod schema, compares spec hashes via SHA-256, `queueWrite()` serializes updates |
| 4 | Previously completed modules are skipped on resume | ✓ VERIFIED | `checkpoint.isDone(unit.name)` filters units, `modulesSkipped` counter tracks, orchestrator only processes pending units |
| 5 | Malformed specs that have neither Build Plan section nor top-level headings produce a descriptive error, not silent failures | ✓ VERIFIED | Lines 84-87 and 101-105 in spec-reader.ts throw explicit error with format guidance after both strategies fail |

#### Plan 11-02 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running 'are rebuild' reads specs, creates rebuild units, executes AI calls, and writes generated files to output directory | ✓ VERIFIED | CLI handler → executeRebuild() → readSpecFiles/partitionSpec/aiService.call/writeFile pipeline fully wired |
| 2 | Dry-run mode shows the rebuild plan without making AI calls or writing files | ✓ VERIFIED | Lines 90-118 in rebuild.ts: early return after displaying plan, checkpoint resume info, no backend resolution |
| 3 | After partial completion, re-running the command auto-resumes from checkpoint, skipping already-done modules | ✓ VERIFIED | CheckpointManager.load() returns `isResume: true`, lines 127-135 filter to pending units, orchestrator logs skip count |
| 4 | Forcing a fresh start wipes the output directory and rebuilds from scratch | ✓ VERIFIED | Line 102 in orchestrator.ts: `await rm(outputDir, { recursive: true, force: true })` when `options.force` |
| 5 | A custom output directory can be specified instead of the default rebuild/ | ✓ VERIFIED | Lines 64-66 in rebuild.ts: `options.output ? path.resolve(options.output) : path.join(absolutePath, 'rebuild')` |
| 6 | Progress is shown during execution (module name, X of Y, ETA) | ✓ VERIFIED | ProgressReporter created at line 144, onFileStart/onFileDone callbacks in runPool at lines 182, 241-249 |
| 7 | Failed modules are logged and checkpointed as failed; remaining modules continue | ✓ VERIFIED | Lines 251-256 orchestrator: error callback marks failed, does not throw (runPool continues unless failFast) |
| 8 | Rebuild units with the same ordering number execute concurrently; different ordering groups execute sequentially | ✓ VERIFIED | Lines 153-161 group by order into Map, lines 167-283 sequential for-loop over sortedOrders with await runPool per group |
| 9 | Context from completed modules (exported type signatures) is passed to subsequent module prompts | ✓ VERIFIED | Lines 269-282 extract exports via regex after each group, line 185 passes `builtContext` to buildRebuildPrompt |

**Score:** 14/14 truths verified

### Required Artifacts

#### Plan 11-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/rebuild/types.ts` | RebuildCheckpoint, RebuildTask, RebuildPlan, RebuildUnit, RebuildResult types | ✓ VERIFIED | 88 lines, 5 exports (RebuildCheckpointSchema + 4 types), Zod schema at line 17 |
| `src/rebuild/spec-reader.ts` | Read spec files from specs/ and partition into rebuild units | ✓ VERIFIED | 250 lines, 2 exports (readSpecFiles, partitionSpec), error handling at 84-87, 101-105 |
| `src/rebuild/output-parser.ts` | Parse multi-file AI output into Map<filePath, content> | ✓ VERIFIED | 69 lines, 1 export (parseModuleOutput), delimiter parsing + fenced block fallback |
| `src/rebuild/checkpoint.ts` | CheckpointManager class with promise-chain serialized writes | ✓ VERIFIED | 238 lines, writeQueue pattern at line 27, 225-237, imports computeContentHashFromString |
| `src/rebuild/index.ts` | Barrel re-export of all rebuild module exports | ✓ VERIFIED | 27 lines, re-exports types, schema, functions, classes from all modules |

#### Plan 11-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/rebuild/prompts.ts` | System prompt and per-unit user prompt builder | ✓ VERIFIED | 106 lines, REBUILD_SYSTEM_PROMPT const, buildRebuildPrompt with builtContext param |
| `src/rebuild/orchestrator.ts` | executeRebuild function wiring pool, AIService, checkpoint, progress | ✓ VERIFIED | 290 lines, order-grouped execution, context accumulation with try-catch, tracer events |
| `src/cli/rebuild.ts` | CLI rebuild command handler with RebuildOptions | ✓ VERIFIED | 235 lines, follows generate.ts pattern, 15min timeout, dry-run, force, all flags |
| `src/cli/index.ts` | rebuild command registration in CLI router | ✓ VERIFIED | Import at line 20, case at line 298, USAGE string includes rebuild examples |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| checkpoint.ts | change-detection/index.ts | computeContentHashFromString | ✓ WIRED | Line 13 imports, used at lines 85, 124 for spec drift detection |
| checkpoint.ts | types.ts | RebuildCheckpoint type | ✓ WIRED | Line 14 imports, used throughout for data structure |
| spec-reader.ts | types.ts | RebuildUnit type | ✓ WIRED | Line 12 imports, returned from partitionSpec |
| orchestrator.ts | checkpoint.ts | CheckpointManager.load/createFresh | ✓ WIRED | Line 21 imports, called at line 110 with unitNames param |
| orchestrator.ts | orchestration/pool.ts | runPool for concurrency | ✓ WIRED | Line 20 imports, awaited at line 227 inside for-loop |
| orchestrator.ts | ai/service.ts | AIService.call | ✓ WIRED | Line 18-19 imports AIService/AIResponse, called at line 186-190 |
| orchestrator.ts | output-parser.ts | parseModuleOutput | ✓ WIRED | Line 23 imports, called at line 193 |
| orchestrator.ts | prompts.ts | buildRebuildPrompt with builtContext | ✓ WIRED | Line 25 imports, called at line 185 passing `builtContext \|\| undefined` |
| orchestrator.ts | orchestrator.ts | Sequential for-loop over order groups | ✓ WIRED | Line 167 `for (const orderValue of sortedOrders)` with await runPool at 227 |
| rebuild.ts | orchestrator.ts | executeRebuild call | ✓ WIRED | Line 29 imports, called at line 194 |
| cli/index.ts | cli/rebuild.ts | import and switch case routing | ✓ WIRED | Line 20 import, line 298 case 'rebuild' |

### Requirements Coverage

No explicit requirements mapped to Phase 11 in REQUIREMENTS.md. Phase goal self-contained.

### Anti-Patterns Found

None. All files are substantive, well-structured, with proper error handling.

**Positive patterns observed:**
- Descriptive error messages for user-facing failures (spec not found, malformed spec)
- Promise-chain write serialization preventing corruption
- Best-effort export extraction with try-catch fallback
- Dry-run mode exits early before expensive backend resolution
- Checkpoint drift detection prevents silent corruption from spec changes

## Human Verification Required

None. All functionality is structurally verifiable via code inspection.

The rebuild command requires actual spec files and AI backend to execute, but the goal is to verify that the **code exists and is wired correctly**, not to functionally test the entire rebuild pipeline end-to-end.

## Gaps Summary

No gaps found. All must-haves verified at all three levels (exists, substantive, wired).

---

_Verified: 2026-02-09T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
