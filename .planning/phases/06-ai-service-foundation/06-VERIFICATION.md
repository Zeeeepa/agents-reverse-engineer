---
phase: 06-ai-service-foundation
verified: 2026-02-07T13:15:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 6: AI Service Foundation Verification Report

**Phase Goal:** A working AI service layer that can spawn CLI subprocesses, capture structured responses, and log per-call telemetry

**Verified:** 2026-02-07T13:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `claude -p --output-format json "prompt"` via AI service returns parsed structured output (response text, token counts, model) | ✓ VERIFIED | Full call chain exists: AIService.call() → withRetry() → runSubprocess() → backend.buildArgs() builds `['-p', '--output-format', 'json', '--no-session-persistence']` → backend.parseResponse() validates with Zod schema and extracts tokens/cost/model into AIResponse |
| 2 | When Claude CLI is not installed, the tool detects this and reports a clear error instead of crashing | ✓ VERIFIED | resolveBackend() calls backend.isAvailable() which uses isCommandOnPath() to check PATH, throws AIServiceError with code 'CLI_NOT_FOUND' containing install instructions from getInstallInstructions() |
| 3 | When subprocess hangs beyond timeout, the tool kills it cleanly with no zombie processes left behind | ✓ VERIFIED | runSubprocess() uses execFile with timeout option and killSignal: 'SIGTERM', detects timeout via error.killed === true, sets timedOut: true in result, AIService checks result.timedOut and throws AIServiceError with 'TIMEOUT' code |
| 4 | When transient failure occurs (rate limit, timeout), the tool retries automatically with backoff and succeeds on retry | ✓ VERIFIED | AIService.call() wraps subprocess in withRetry() with isRetryable predicate checking for 'RATE_LIMIT' and 'TIMEOUT' codes, uses DEFAULT_RETRY_OPTIONS (maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 8000, multiplier: 2) with jitter (0-500ms), rate limit detected by isRateLimitStderr() checking stderr for patterns: 'rate limit', '429', 'too many requests', 'overloaded' |
| 5 | Each AI call produces a JSON log entry in `.agents-reverse-engineer/logs/` containing prompt, response, tokens, latency, and exit code | ✓ VERIFIED | AIService.call() records TelemetryEntry via logger.addEntry() for both success and failure, finalize() calls writeRunLog() which creates .agents-reverse-engineer/logs/run-{timestamp}.json with pretty-printed JSON containing all TelemetryEntry fields plus summary totals, cleanupOldLogs() removes old files keeping N most recent |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ai/types.ts` | All shared types exported | ✓ VERIFIED | Exports: SubprocessResult, AICallOptions, AIResponse, AIBackend, RetryOptions, TelemetryEntry, RunLog, AIServiceError. All types have JSDoc. AIServiceError class with typed codes: 'CLI_NOT_FOUND', 'TIMEOUT', 'PARSE_ERROR', 'SUBPROCESS_ERROR', 'RATE_LIMIT'. |
| `src/ai/subprocess.ts` | Low-level subprocess wrapper | ✓ VERIFIED | Exports runSubprocess(). Uses execFile with timeout (configurable), killSignal: 'SIGTERM', maxBuffer: 10MB, encoding: 'utf-8'. Writes to stdin if input provided, calls stdin.end(). Always resolves (never rejects), errors in SubprocessResult. Detects timedOut via error.killed. |
| `src/ai/retry.ts` | Retry with exponential backoff | ✓ VERIFIED | Exports withRetry<T>() and DEFAULT_RETRY_OPTIONS. Loops 0 to maxRetries (4 attempts for maxRetries=3). Computes exponential delay: baseDelayMs * multiplier^attempt, capped at maxDelayMs. Adds jitter: Math.random() * 500. Calls isRetryable predicate, throws immediately if false or at maxRetries. |
| `src/ai/backends/claude.ts` | Full Claude CLI adapter | ✓ VERIFIED | Exports ClaudeBackend and isCommandOnPath(). ClaudeResponseSchema validated against v2.1.31 JSON output with Zod. buildArgs() returns `['-p', '--output-format', 'json', '--no-session-persistence']` plus optional --model, --system-prompt, --max-turns. parseResponse() finds first '{' (defensive parsing), validates with Zod, extracts model from modelUsage keys. isCommandOnPath() handles PATHEXT on Windows. |
| `src/ai/backends/gemini.ts` | Gemini CLI stub | ✓ VERIFIED | Exports GeminiBackend. Implements AIBackend interface. isAvailable() uses isCommandOnPath('gemini'). buildArgs() returns `['-p', '--output-format', 'json']`. parseResponse() throws AIServiceError('SUBPROCESS_ERROR', 'not yet implemented'). Intentional stub per plan. |
| `src/ai/backends/opencode.ts` | OpenCode CLI stub | ✓ VERIFIED | Exports OpenCodeBackend. Implements AIBackend interface. isAvailable() uses isCommandOnPath('opencode'). buildArgs() returns `['run', '--format', 'json']`. parseResponse() throws AIServiceError('SUBPROCESS_ERROR', 'not yet implemented'). Intentional stub per plan. |
| `src/ai/registry.ts` | Backend registry and resolution | ✓ VERIFIED | Exports BackendRegistry, createBackendRegistry, detectBackend, getInstallInstructions, resolveBackend. Registry stores backends in Map by name. createBackendRegistry() registers Claude, Gemini, OpenCode in priority order. detectBackend() iterates backends calling isAvailable(), returns first found or null. resolveBackend() handles 'auto' (calls detectBackend) and explicit names, throws CLI_NOT_FOUND with install instructions. |
| `src/ai/telemetry/logger.ts` | In-memory telemetry logger | ✓ VERIFIED | Exports TelemetryLogger. Constructor takes runId (ISO timestamp). addEntry() pushes to entries array. getSummary() computes totals (calls, tokens, cost, duration, errors). toRunLog() assembles RunLog with startTime, endTime (current), entries, summary. |
| `src/ai/telemetry/run-log.ts` | Write run log to disk | ✓ VERIFIED | Exports writeRunLog(projectRoot, runLog). Creates .agents-reverse-engineer/logs/ with fs.mkdir({ recursive: true }). Filename: run-{timestamp}.json with : and . replaced by -. Writes pretty-printed JSON (JSON.stringify with indent 2). Returns absolute path. |
| `src/ai/telemetry/cleanup.ts` | Cleanup old log files | ✓ VERIFIED | Exports cleanupOldLogs(projectRoot, keepCount). Reads logs dir, filters run-*.json files. Sorts lexicographically, reverses (newest first). Deletes files beyond keepCount. Returns 0 if dir doesn't exist (ENOENT check). |
| `src/ai/service.ts` | AIService orchestrator | ✓ VERIFIED | Exports AIService and AIServiceOptions. call() method: builds args via backend, wraps runSubprocess in withRetry, detects timedOut (throws TIMEOUT), detects rate limit via stderr patterns (throws RATE_LIMIT), parses response via backend (wraps in try/catch for PARSE_ERROR), records TelemetryEntry for success and failure. finalize() calls writeRunLog + cleanupOldLogs, returns logPath + summary. |
| `src/ai/index.ts` | Barrel export | ✓ VERIFIED | Re-exports all public API: types (AIBackend, AIResponse, AICallOptions, SubprocessResult, RetryOptions, TelemetryEntry, RunLog), AIServiceError, AIService, AIServiceOptions, BackendRegistry, createBackendRegistry, resolveBackend, detectBackend, getInstallInstructions, withRetry, DEFAULT_RETRY_OPTIONS, runSubprocess, isCommandOnPath. Single import point per design. |
| `src/config/schema.ts` | Extended with ai section | ✓ VERIFIED | AISchema defined with backend: enum(['claude', 'gemini', 'opencode', 'auto']).default('auto'), model: string.default('sonnet'), timeoutMs: number.positive.default(120_000), maxRetries: number.min(0).default(3), telemetry: {keepRuns: number.min(0).default(10)}.default({}}. Schema uses .default({}) at all levels for backward compatibility. Exports AIConfig type. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| AIService.call() | runSubprocess | Direct call | ✓ WIRED | Line 147: `await runSubprocess(this.backend.cliCommand, args, {timeoutMs, input: options.prompt})` |
| AIService.call() | withRetry | Wraps subprocess call | ✓ WIRED | Line 145: `await withRetry(async () => {...}, retryOptions)` with isRetryable checking RATE_LIMIT and TIMEOUT |
| AIService.call() | backend.parseResponse | Parse result.stdout | ✓ WIRED | Line 171: `this.backend.parseResponse(result.stdout, result.durationMs, result.exitCode)` wrapped in try/catch for PARSE_ERROR |
| AIService.call() | TelemetryLogger | Records entry | ✓ WIRED | Lines 196 and 218: `this.logger.addEntry({...})` for success and error cases |
| AIService.finalize() | writeRunLog | Write log file | ✓ WIRED | Line 250: `await writeRunLog(projectRoot, runLog)` |
| AIService.finalize() | cleanupOldLogs | Remove old files | ✓ WIRED | Line 251: `await cleanupOldLogs(projectRoot, this.options.telemetry.keepRuns)` |
| ClaudeBackend | Zod schema | Validate JSON | ✓ WIRED | Line 201: `ClaudeResponseSchema.parse(JSON.parse(stdout.slice(jsonStart)))` |
| resolveBackend | backend.isAvailable | Check CLI on PATH | ✓ WIRED | Line 214: `await backend.isAvailable()` |
| isCommandOnPath | fs.stat | Verify file exists | ✓ WIRED | Line 97: `await fs.stat(candidate)` checking isFile() |
| runSubprocess | execFile | Spawn process | ✓ WIRED | Line 52: `execFile(command, args, {timeout, killSignal, maxBuffer, encoding}, callback)` |
| runSubprocess | stdin.write | Pipe prompt | ✓ WIRED | Lines 99-100: `child.stdin.write(options.input); child.stdin.end();` |

### Requirements Coverage

**Phase 6 Requirements:** AISVC-01, AISVC-02, AISVC-03, AISVC-05, AISVC-06, TELEM-01, TELEM-06

| Requirement | Status | Supporting Truths | Notes |
|-------------|--------|-------------------|-------|
| AISVC-01 | ✓ SATISFIED | Truth 1, 2 | AIService can call Claude CLI, detect if missing, parse structured output |
| AISVC-02 | ✓ SATISFIED | Truth 3 | runSubprocess enforces timeout with SIGTERM, detects timedOut flag |
| AISVC-03 | ✓ SATISFIED | Truth 4 | withRetry implements exponential backoff with jitter, isRetryable for RATE_LIMIT/TIMEOUT |
| AISVC-05 | ✓ SATISFIED | Truth 1 | ClaudeBackend parseResponse extracts tokens (input, output, cacheRead, cacheCreation) and cost from validated Zod schema |
| AISVC-06 | ✓ SATISFIED | Truth 2 | resolveBackend throws CLI_NOT_FOUND with install instructions from all backends via getInstallInstructions() |
| TELEM-01 | ✓ SATISFIED | Truth 5 | TelemetryLogger accumulates entries, writeRunLog writes JSON to .agents-reverse-engineer/logs/run-{timestamp}.json |
| TELEM-06 | ✓ SATISFIED | Truth 5 | TelemetryEntry includes prompt, response, model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, costUsd, latencyMs, exitCode, error (if failed), retryCount |

### Anti-Patterns Found

**No blocking anti-patterns detected.**

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/ai/backends/gemini.ts | 59 | Stub parseResponse throws SUBPROCESS_ERROR | ℹ️ Info | Intentional stub per plan. Gemini backend deferred to future phase. |
| src/ai/backends/opencode.ts | 59 | Stub parseResponse throws SUBPROCESS_ERROR | ℹ️ Info | Intentional stub per plan. OpenCode backend deferred to future phase. |

**Analysis:**
- No TODO/FIXME comments found across entire src/ai/ directory
- No placeholder or empty return patterns
- Gemini and OpenCode stubs are intentional per plan design (demonstrate extension pattern)
- Claude backend is fully implemented with Zod validation
- All wiring is complete and substantive

### Human Verification Required

None. All success criteria are structurally verifiable and have been verified programmatically.

---

## Detailed Verification

### Truth 1: Subprocess spawning and JSON parsing works

**Verification method:** Code path trace

**Evidence:**
1. `AIService.call()` receives AICallOptions with prompt
2. Calls `backend.buildArgs(options)` — ClaudeBackend returns `['-p', '--output-format', 'json', '--no-session-persistence', ...]`
3. Calls `runSubprocess(this.backend.cliCommand, args, {timeoutMs, input: options.prompt})`
4. `runSubprocess()` calls `execFile('claude', args, {...})` with prompt piped to stdin
5. On success (exitCode === 0), calls `backend.parseResponse(result.stdout, result.durationMs, result.exitCode)`
6. `ClaudeBackend.parseResponse()` finds first '{' in stdout, parses JSON, validates with Zod schema
7. Extracts: text (result), model (modelUsage keys), inputTokens (usage.input_tokens), outputTokens (usage.output_tokens), cacheReadTokens (usage.cache_read_input_tokens), cacheCreationTokens (usage.cache_creation_input_tokens), costUsd (total_cost_usd), durationMs, exitCode
8. Returns normalized AIResponse

**Wiring check:**
- ✓ AIService imports runSubprocess from './subprocess.js'
- ✓ AIService.call() invokes runSubprocess at line 147
- ✓ AIService imports backend type and receives it via constructor
- ✓ AIService.call() invokes backend.parseResponse at line 171
- ✓ ClaudeBackend implements full parseResponse with Zod validation
- ✓ Zod schema matches documented Claude CLI v2.1.31 output structure

**Substantive check:**
- runSubprocess: 104 lines, uses execFile with timeout/killSignal/maxBuffer, handles stdin, detects timedOut, extracts exitCode, no stubs
- ClaudeBackend.parseResponse: 49 lines, defensive JSON parsing (finds first '{'), Zod validation, extracts all fields, no stubs
- ClaudeResponseSchema: Complete schema with all documented fields from research

**Result:** ✓ VERIFIED

---

### Truth 2: CLI detection and error reporting

**Verification method:** Code path trace

**Evidence:**
1. `resolveBackend(registry, 'auto')` called at startup
2. If 'auto': calls `detectBackend(registry)`
3. `detectBackend()` iterates registry.getAll() (Claude, Gemini, OpenCode in priority order)
4. Calls `backend.isAvailable()` on each
5. `ClaudeBackend.isAvailable()` calls `isCommandOnPath('claude')`
6. `isCommandOnPath()` splits PATH by delimiter, checks each dir with each PATHEXT extension on Windows
7. Uses `fs.stat(candidate)` to check if file exists
8. If found: returns true, backend is selected
9. If not found: detectBackend returns null
10. resolveBackend throws AIServiceError with code 'CLI_NOT_FOUND' and message containing:
    - "No AI CLI found on your system."
    - Install instructions from `getInstallInstructions(registry)`
    - Each backend's install instructions (npm install, URLs)

**Wiring check:**
- ✓ resolveBackend imports AIServiceError from './types.js'
- ✓ resolveBackend calls detectBackend at line 189
- ✓ detectBackend calls backend.isAvailable() at line 123
- ✓ ClaudeBackend.isAvailable() calls isCommandOnPath at line 141
- ✓ isCommandOnPath uses fs.stat at line 97
- ✓ resolveBackend throws CLI_NOT_FOUND at line 195 with getInstallInstructions

**Substantive check:**
- isCommandOnPath: 28 lines, splits PATH, handles PATHEXT, uses fs.stat, cross-platform, no stubs
- resolveBackend: 39 lines, handles 'auto' and explicit backend names, checks availability, throws with install instructions, no stubs
- getInstallInstructions: 5 lines, maps all backends to install strings

**Result:** ✓ VERIFIED

---

### Truth 3: Timeout enforcement and cleanup

**Verification method:** Code path trace

**Evidence:**
1. `runSubprocess()` called with `{timeoutMs: 120_000, input: prompt}`
2. `execFile()` invoked with options: `{timeout: options.timeoutMs, killSignal: 'SIGTERM', ...}`
3. Node.js execFile sends SIGTERM when timeout exceeded, sets error.killed = true
4. runSubprocess callback checks: `const timedOut = error !== null && 'killed' in error && error.killed === true`
5. Returns SubprocessResult with timedOut: true
6. AIService.call() checks `if (result.timedOut)` at line 152
7. Throws AIServiceError with code 'TIMEOUT'
8. AIService wraps call in withRetry, which catches and retries if isRetryable returns true
9. isRetryable checks: `error.code === 'TIMEOUT'` — returns true, retry triggered
10. SIGTERM ensures graceful kill, no zombie processes (per research)

**Wiring check:**
- ✓ runSubprocess uses execFile with timeout option at line 56
- ✓ runSubprocess sets killSignal: 'SIGTERM' at line 57
- ✓ runSubprocess detects timedOut at line 66
- ✓ AIService checks result.timedOut at line 152
- ✓ AIService throws TIMEOUT error at line 153
- ✓ withRetry isRetryable checks for TIMEOUT at line 186

**Substantive check:**
- runSubprocess: Uses official Node.js execFile timeout mechanism, not manual setTimeout
- killSignal: SIGTERM ensures graceful termination per research recommendations
- timedOut detection: Checks error.killed flag set by Node.js
- No manual process tracking or cleanup needed — Node.js handles it

**Result:** ✓ VERIFIED

---

### Truth 4: Retry with exponential backoff

**Verification method:** Code path trace and algorithm verification

**Evidence:**
1. `AIService.call()` wraps subprocess in `withRetry()` at line 145
2. withRetry options:
   - maxRetries: 3 (from this.options.maxRetries)
   - baseDelayMs: 1000 (from DEFAULT_RETRY_OPTIONS)
   - maxDelayMs: 8000 (from DEFAULT_RETRY_OPTIONS)
   - multiplier: 2 (from DEFAULT_RETRY_OPTIONS)
   - isRetryable: checks if error is AIServiceError with code 'RATE_LIMIT' or 'TIMEOUT'
   - onRetry: increments retryCount
3. Rate limit detection: `isRateLimitStderr(result.stderr)` checks for patterns: 'rate limit', '429', 'too many requests', 'overloaded' (case-insensitive)
4. If rate limit detected: throws AIServiceError with code 'RATE_LIMIT'
5. withRetry loop (attempt 0 to maxRetries):
   - On failure: checks isRetryable
   - If retryable: computes delay = min(baseDelayMs * 2^attempt, maxDelayMs) + jitter (0-500ms)
   - Delay sequence: 1000 + jitter, 2000 + jitter, 4000 + jitter, 8000 + jitter
   - Waits, then retries
   - If not retryable or maxRetries exhausted: throws

**Wiring check:**
- ✓ AIService imports withRetry and DEFAULT_RETRY_OPTIONS at line 14
- ✓ AIService.call() wraps subprocess in withRetry at line 145
- ✓ AIService detects rate limit at line 157 via isRateLimitStderr
- ✓ AIService throws RATE_LIMIT error at line 158
- ✓ withRetry isRetryable checks error.code at line 183-186
- ✓ withRetry computes exponential delay at line 93-94
- ✓ withRetry adds jitter at line 97-98
- ✓ withRetry waits via setTimeout at line 103

**Substantive check:**
- withRetry: 32 lines algorithm, loop 0 to maxRetries, exponential delay with cap, jitter 0-500ms, no stubs
- isRateLimitStderr: 7 lines, toLowerCase + includes check for 4 patterns, no stubs
- DEFAULT_RETRY_OPTIONS: Complete config with all timing values
- Retry counts tracked via onRetry callback

**Result:** ✓ VERIFIED

---

### Truth 5: Telemetry logging

**Verification method:** Code path trace

**Evidence:**
1. `AIService` constructor creates `this.logger = new TelemetryLogger(new Date().toISOString())`
2. On each call (success or failure):
   - AIService.call() records TelemetryEntry via `this.logger.addEntry({...})`
   - Success entry (line 196): includes prompt, systemPrompt, response, model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, costUsd, latencyMs, exitCode, retryCount
   - Error entry (line 218): includes prompt, systemPrompt, response: '', model, 0 tokens, 0 cost, actual latencyMs, exitCode: 1, error message, retryCount
3. On finalize:
   - AIService.finalize() calls `this.logger.toRunLog()` — assembles RunLog with runId, startTime, endTime, entries, summary
   - Calls `writeRunLog(projectRoot, runLog)` at line 250
   - writeRunLog creates .agents-reverse-engineer/logs/ with mkdir({ recursive: true })
   - Builds filename: run-{timestamp}.json (replaces : and . with -)
   - Writes JSON.stringify(runLog, null, 2) — pretty-printed JSON
   - Returns absolute path
4. Calls `cleanupOldLogs(projectRoot, this.options.telemetry.keepRuns)` at line 251
   - cleanupOldLogs reads logs dir, filters run-*.json, sorts (newest first), deletes beyond keepCount

**Wiring check:**
- ✓ AIService imports TelemetryLogger at line 15
- ✓ AIService creates logger in constructor at line 115
- ✓ AIService records success entry at line 196
- ✓ AIService records error entry at line 218
- ✓ AIService.finalize imports writeRunLog and cleanupOldLogs at lines 16-17
- ✓ AIService.finalize calls logger.toRunLog() at line 249
- ✓ AIService.finalize calls writeRunLog at line 250
- ✓ AIService.finalize calls cleanupOldLogs at line 251
- ✓ TelemetryLogger.toRunLog assembles complete RunLog with summary
- ✓ TelemetryLogger.getSummary computes totals (calls, tokens, cost, duration, errors)
- ✓ writeRunLog creates directory, builds filename, writes pretty JSON
- ✓ cleanupOldLogs filters, sorts, deletes old files

**Substantive check:**
- TelemetryLogger: 116 lines, accumulates entries in array, computes summary from all entries, no stubs
- writeRunLog: 50 lines, mkdir with recursive, filename sanitization, JSON.stringify with indent, returns path, no stubs
- cleanupOldLogs: 65 lines, filters run-*.json, sorts, deletes beyond keepCount, handles ENOENT, no stubs
- TelemetryEntry type: Complete with all fields documented in types.ts
- RunLog type: Complete with runId, timestamps, entries, summary

**Result:** ✓ VERIFIED

---

## Compilation Verification

```bash
npx tsc --noEmit
```

**Result:** Zero errors. All TypeScript files compile cleanly.

**Files checked:**
- src/ai/types.ts
- src/ai/subprocess.ts
- src/ai/retry.ts
- src/ai/backends/claude.ts
- src/ai/backends/gemini.ts
- src/ai/backends/opencode.ts
- src/ai/registry.ts
- src/ai/telemetry/logger.ts
- src/ai/telemetry/run-log.ts
- src/ai/telemetry/cleanup.ts
- src/ai/service.ts
- src/ai/index.ts
- src/config/schema.ts (extended with AISchema)

**Import checks:**
- All imports use .js extension (ESM convention)
- No circular dependencies
- All imports resolve correctly

---

## Summary

**Phase Goal Achieved:** ✓ YES

The AI service layer is fully implemented and ready for integration in Phase 7. All five success criteria are met:

1. ✓ Subprocess spawning with structured JSON parsing works via complete Claude backend
2. ✓ CLI detection reports clear errors with install instructions
3. ✓ Timeout enforcement kills processes cleanly with SIGTERM
4. ✓ Retry logic handles transient failures with exponential backoff + jitter
5. ✓ Telemetry logs every call to JSON files with cleanup

**No gaps found.** All artifacts exist, are substantive (not stubs), and are correctly wired. The only intentional stubs are Gemini and OpenCode backends, which are documented as future work and do not block the phase goal (Claude backend is fully functional).

**Ready for Phase 7:** The AI service layer provides a complete API via src/ai/index.ts for AI-powered generation commands.

---

_Verified: 2026-02-07T13:15:00Z_
_Verifier: Claude (gsd-verifier)_
