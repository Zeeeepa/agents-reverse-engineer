# Domain Pitfalls: AI CLI Subprocess Orchestration, Telemetry & Context Density

**Domain:** Adding AI CLI subprocess invocation, telemetry, and quality improvements to existing Node.js/TypeScript documentation tool
**Researched:** 2026-02-07
**Scope:** v2.0 milestone -- pitfalls specific to ADDING these features to agents-reverse-engineer
**Overall Confidence:** MEDIUM (Claude CLI flags verified from `claude --help`; Node.js child_process from training data; Gemini CLI details LOW confidence)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or broken core functionality.

---

### Pitfall 1: stdout Buffer Deadlock on Large LLM Responses

**What goes wrong:** `child_process.spawn` or `execFile` pipes stdout and stderr through OS-level buffers (typically 64KB on Linux, 4KB on macOS). When an LLM CLI outputs a long response (a 500-word summary can easily be 3-5KB, and JSON-wrapped output with thinking/tokens metadata can be 10-50KB), the process writes to stdout. If the parent is not actively draining the stream -- for example because it is waiting on `close` before reading, or because it reads stderr first in a blocking manner -- the OS buffer fills and the child process blocks on its write() call. The child hangs. The parent waits for the child to exit. Classic deadlock.

**Why it happens:** Developers use `child_process.execSync` or `execFile` with `maxBuffer` defaults (1MB in Node.js). This seems fine for small outputs. But with JSON output mode containing embedded prompt text and response text, a single Claude CLI call can produce output exceeding `maxBuffer`. Alternatively, developers use `spawn` but only attach listeners after a delay, or use a simplistic `data += chunk` pattern that does not handle backpressure.

**Consequences:**
- Process hangs indefinitely (no timeout fires because the process is still "alive" but blocked)
- Entire generation run stalls on a single file
- User sees frozen progress with no error message

**Prevention:**
- Use `spawn` (never `execSync` for LLM calls) and attach stdout/stderr `data` listeners BEFORE calling the process
- Collect output incrementally: `const chunks: Buffer[] = []; child.stdout.on('data', (chunk) => chunks.push(chunk));`
- Set `maxBuffer` to at least 10MB if using `execFile`, but prefer `spawn` for streaming
- Always set a timeout (see Pitfall 3) that kills the process to prevent indefinite hangs
- For JSON output mode, accumulate the full output before parsing -- LLM JSON responses are NOT newline-delimited unless using `stream-json` mode

**Warning signs:**
- Tests pass with short prompts but hang with real file content
- Process works for small files but freezes on files over ~50KB of source content
- CPU usage drops to zero during a "running" task

**Detection:** Monitor child process state; if stdout has not received data for >30 seconds but process is still alive, likely deadlocked.

**Phase to address:** Phase 1 (AI Service abstraction) -- this must be right from the first implementation.

---

### Pitfall 2: Claude CLI `--output-format json` Response Parsing Fragility

**What goes wrong:** The `claude` CLI with `--print --output-format json` returns a JSON object containing the response. Developers hardcode expectations about the JSON structure, field names, or nesting. Then a Claude CLI update changes the schema -- adds fields, renames fields, wraps output differently -- and parsing breaks silently (returning undefined/null) or loudly (JSON parse error).

**Why it happens:** The Claude CLI JSON output format is an interface between two independently-versioned systems: the `claude` CLI binary (auto-updates) and the `agents-reverse-engineer` tool. The JSON schema is not formally versioned or guaranteed stable. From the `claude --help` output, the modes are:
- `--output-format text` (default): Plain text response
- `--output-format json`: Single JSON object result
- `--output-format stream-json`: Realtime streaming JSON events

The JSON structure likely includes fields for the response text, possibly token usage, possibly cost -- but the exact schema depends on the CLI version installed on the user's machine.

**Consequences:**
- Silent data loss: response text extracted as `undefined`, written as empty .sum files
- Crash on JSON.parse if CLI outputs non-JSON (error messages, warnings, or mixed output)
- Works on developer's machine, fails on user's machine with different CLI version

**Prevention:**
- Parse JSON inside try/catch; ALWAYS validate the parsed result has expected fields before using it
- Define a minimal expected interface (e.g., `{ result: string }` or `{ content: string }`) and validate with zod at runtime
- Fall back to raw text output if JSON parsing fails -- `--output-format text` is more stable
- Log the raw output before parsing so debugging is possible
- Pin expectations to observed behavior but version-gate: check `claude --version` at startup and warn if untested version
- Write an adapter layer that normalizes Claude/Gemini/OpenCode output into a common internal format -- isolate format parsing from business logic
- In the stream-json case (`--output-format stream-json`): each line is a separate JSON object; parse line-by-line, not as a single JSON blob

**Warning signs:**
- Empty or `undefined` values appearing in .sum files
- "Unexpected token" errors in production but not in tests
- Tests use mocked CLI output that does not match real CLI output

**Detection:** Validate every parsed field is non-null/non-undefined before use. Log raw output length vs parsed content length.

**Phase to address:** Phase 1 (AI Service) -- build the adapter layer with schema validation from day one.

---

### Pitfall 3: Missing or Broken Timeout Management Leading to Zombie Processes

**What goes wrong:** An LLM CLI call hangs (network issue, API overload, rate limit with long backoff, malformed prompt causing infinite thinking). Without a timeout, the parent process waits forever. With a naive timeout (e.g., `setTimeout` + `child.kill()`), the child process may not actually die because:
1. `child.kill()` sends SIGTERM which CLI may catch and ignore
2. The child may have spawned its own children (Claude CLI might spawn sub-processes) that survive parent kill
3. On Windows, `child.kill()` behavior is different (no SIGTERM, just TerminateProcess)

**Why it happens:** LLM calls have highly variable latency. A simple file might take 5 seconds; a complex 3000-token file might take 60 seconds. There is no single correct timeout. Developers set a generous timeout (5 minutes), which means a stuck process wastes 5 minutes before recovery. Or they set a tight timeout (30 seconds) and kill legitimate long-running analyses.

**Consequences:**
- Zombie processes accumulating, consuming memory and file descriptors
- Process table pollution on long runs (hundreds of files = hundreds of potential zombies)
- User's machine becoming unresponsive during large generation runs
- Orphaned LLM API calls continuing to run (and bill) after parent gives up

**Prevention:**
- Use `AbortController` with `signal` option on `spawn` (Node.js 16+): `spawn('claude', args, { signal: controller.signal })`. This cleanly kills the process tree.
- Implement two-phase kill: SIGTERM first, wait 5 seconds, then SIGKILL if still alive
- Set process group: `spawn('claude', args, { detached: false })` -- the default, but be explicit
- Track all spawned processes in a Set and clean up on parent exit: `process.on('exit', () => killAll())`
- Use adaptive timeouts: start with 120 seconds, increase if the file is large (scale with token count)
- Log timeout events with the file that caused it -- this is debugging gold
- On SIGINT/SIGTERM to the parent process, kill all children before exiting

**Warning signs:**
- `ps aux | grep claude` shows many orphaned processes after a run
- System memory growing during generation runs even after files are "complete"
- Parent process exit does not release all resources

**Detection:** After each child process completes (or times out), verify it actually exited: `child.exitCode !== null`. Add a process-count health check between batches.

**Phase to address:** Phase 1 (AI Service) -- process lifecycle management is foundational.

---

### Pitfall 4: Shell Injection via Prompt Content in CLI Arguments

**What goes wrong:** The tool constructs a CLI command like `claude -p "Analyze this file: ${fileContent}"` using string interpolation. File content or file paths containing shell metacharacters (`$`, `` ` ``, `"`, `\`, `$(...)`, `|`, `;`) get interpreted by the shell, causing command injection, broken commands, or mangled prompts.

**Why it happens:** Developers use `child_process.exec()` (which invokes a shell) instead of `spawn()` (which does not). Or they use `spawn` with `{ shell: true }`. File paths with spaces, parentheses (common in C# projects), or dollar signs break argument passing. Prompt templates containing backticks or quotes cause similar issues.

**Consequences:**
- Arbitrary command execution (security vulnerability)
- Corrupted prompts producing garbage summaries
- Silent failures where part of the prompt is interpreted as a separate command
- Failures on specific files whose paths contain special characters

**Prevention:**
- ALWAYS use `spawn()` or `execFile()` with argument arrays, NEVER `exec()` with string interpolation
- Pass prompts via stdin, not as command-line arguments: `child.stdin.write(prompt); child.stdin.end();`
- For Claude CLI: use `--system-prompt` flag with the argument array (spawn handles quoting) and pipe the user prompt via stdin
- Never use `{ shell: true }` option with spawn
- Validate file paths before including in prompts (strip or escape control characters)
- For very long prompts that exceed argument length limits (128KB on Linux, 32KB on Windows), stdin piping is the ONLY option

**Warning signs:**
- Tests pass with clean file names but fail on real codebases with paths like `src/utils/$(helpers).ts`
- Prompts are truncated or contain unexpected characters in the output
- "command not found" errors when prompt content contains pipe characters

**Detection:** Log the exact arguments passed to spawn (not the constructed prompt) and compare with what the CLI actually received.

**Phase to address:** Phase 1 (AI Service) -- get argument passing right from the start; retrofitting is painful.

---

### Pitfall 5: Telemetry Log File Growth Consuming Disk Space

**What goes wrong:** The tool logs full prompts and full responses for every LLM call as JSON. For a 500-file project, each file generates ~2KB prompt + ~3KB response = ~5KB per call. That is 2.5MB of logs -- manageable. But for a 5,000-file project with chunked processing (say 8,000 total calls), with prompts containing full file content (10-50KB per prompt), and responses of 3-5KB, the telemetry log grows to 80-400MB PER RUN. Multiple runs accumulate.

**Why it happens:** Developers log "everything" for debugging, which is correct during development. But they forget to implement log rotation, size limits, or differential logging (log metadata always, log full content only when configured).

**Consequences:**
- Disk space exhaustion, especially on CI/CD runners with limited storage
- Slow JSON parsing when trying to analyze logs (loading a 400MB JSON file into memory)
- Git repositories accidentally committing log files (if not properly gitignored)
- Performance degradation as the log file grows (appending to large files, fsync overhead)

**Prevention:**
- Use NDJSON (newline-delimited JSON), one JSON object per line, NOT one giant JSON array
- This enables: streaming reads, `wc -l` for count, `head`/`tail` for recent entries, and append-only writes
- Implement log levels: METADATA (always: timing, tokens, file path, exit code) vs FULL (opt-in: complete prompt and response text)
- Default to METADATA level; make FULL available via `--telemetry-verbose` or config flag
- Set a max log file size (e.g., 50MB); rotate when exceeded (rename to `.1`, `.2`, etc. or just truncate)
- Store logs in `.agents-reverse-engineer/logs/` and add to `.gitignore` template
- For full prompt/response logging, consider writing each call's data to a separate file: `logs/2026-02-07/call-001.json`
- Include a `log-clean` command or auto-prune logs older than 7 days

**Warning signs:**
- `.agents-reverse-engineer/` directory growing to gigabytes
- `JSON.parse()` failing with out-of-memory on log analysis
- Disk space warnings on CI runners

**Detection:** Check log file size before each write; warn if over threshold.

**Phase to address:** Phase 2 (Telemetry) -- design the log format and rotation strategy before writing the first log entry.

---

### Pitfall 6: Incomplete Telemetry on Crash or Timeout

**What goes wrong:** The tool writes telemetry log entries after the LLM call completes. If the process crashes mid-call (OOM, SIGKILL, power loss), the telemetry entry for that call is never written. Worse, if the tool batches telemetry writes (e.g., writes all entries at the end of a phase), a crash loses ALL telemetry for the current phase.

**Why it happens:** Developers optimize for the happy path: call LLM, get response, log result. They don't consider the failure path: call LLM, process dies, no log entry. This creates a blind spot: the most interesting debugging data (what happened during the crash) is exactly what is missing.

**Consequences:**
- Cannot debug why a run failed (no telemetry for the failing call)
- Token usage accounting is wrong (calls were made and billed but not logged)
- Resumption logic does not know which files were actually processed
- "Works fine" claim is unfalsifiable because failures leave no trace

**Prevention:**
- Write-ahead logging: write a "STARTED" entry BEFORE the LLM call, then update it to "COMPLETED" or "FAILED" after
- Each entry has a unique ID (e.g., `call-{timestamp}-{fileHash}`)
- Use append-only NDJSON so partial writes do not corrupt previous entries
- Flush after each write: `fs.appendFileSync()` or `await fs.appendFile()` with explicit flush
- On startup, scan for entries in STARTED state with no COMPLETED/FAILED -- these are crash-orphans
- Store the current call's metadata in a separate "in-flight" file that is deleted on completion
- The in-flight file also serves as a resume marker: if the tool restarts, it knows which call was interrupted

**Warning signs:**
- Token usage reported by telemetry is consistently lower than API billing
- "File already has .sum file but no telemetry entry" discrepancies
- Crash debugging requires reproduction because no logs exist

**Detection:** After each run, compare the set of files processed (from .sum file existence) against telemetry entries. Discrepancies indicate lost telemetry.

**Phase to address:** Phase 2 (Telemetry) -- write-ahead pattern must be designed in, not bolted on.

---

## Moderate Pitfalls

Mistakes that cause delays, incorrect results, or significant technical debt.

---

### Pitfall 7: Multi-CLI Output Format Divergence

**What goes wrong:** Claude CLI, Gemini CLI, and OpenCode all produce different output formats, error patterns, and exit codes. Developers build the abstraction layer around Claude CLI (the primary target), then discover that Gemini CLI returns output in a fundamentally different structure. The adapter layer becomes a mess of special cases, or worse, the tool only truly works with one CLI.

**Why it happens:** Each CLI tool is built by a different team with different conventions:

**Claude CLI** (verified from `claude --help`):
- `--print` flag for non-interactive mode (required for subprocess use)
- `--output-format json` returns structured JSON
- `--output-format stream-json` returns streaming JSON events
- `--system-prompt` flag for system prompt
- `--model` flag for model selection
- `--max-budget-usd` for cost control
- `--dangerously-skip-permissions` or `--permission-mode` for non-interactive file access
- `--allowedTools` to restrict tool usage
- `--json-schema` for structured output validation
- Prompt passed as positional argument or via stdin

**Gemini CLI** (LOW confidence -- based on training data):
- May or may not have a JSON output mode
- Different flag naming conventions
- Different error message format
- May require different authentication flow

**OpenCode** (LOW confidence):
- Plugin-based, may not have a subprocess invocation mode
- Output format undocumented

**Consequences:**
- Adapter layer works for Claude, crashes for Gemini
- Error handling logic only catches Claude-style errors
- Token usage extraction fails because different CLIs report it differently
- Users who prefer Gemini cannot use the tool

**Prevention:**
- Define a strict internal interface FIRST, before implementing any CLI adapter:
  ```typescript
  interface AIServiceResult {
    content: string;          // The actual response text
    tokensIn?: number;        // Input tokens (if reported)
    tokensOut?: number;       // Output tokens (if reported)
    thinkingContent?: string; // Extended thinking (if available)
    model?: string;           // Model used
    durationMs: number;       // Wall-clock time
    exitCode: number;         // Process exit code
    rawOutput: string;        // Unprocessed output for debugging
  }
  ```
- Implement Claude adapter FIRST (best documented, most features, available locally)
- Mark Gemini and OpenCode adapters as `experimental` with reduced feature sets
- Use a "least common denominator" approach: the common interface only promises what ALL adapters can deliver
- CLI-specific features (thinking, token usage) are OPTIONAL fields with `undefined` as default
- Test each adapter against the real CLI, not just mocks -- CLI behavior is the source of truth
- Version-check each CLI at startup and warn about untested versions

**Warning signs:**
- All tests use mocked output; no integration tests against real CLIs
- Adapter has if/else chains for CLI-specific behavior scattered throughout
- Adding a new CLI requires changes in dozens of files

**Detection:** Run the same prompt through each CLI adapter and compare the normalized output. Differences indicate adapter bugs.

**Phase to address:** Phase 1 (AI Service) -- define the interface first, implement adapters second.

---

### Pitfall 8: Claude CLI Permission Mode Causing Interactive Prompts in Subprocess

**What goes wrong:** The Claude CLI, when run without `--dangerously-skip-permissions` or `--permission-mode bypassPermissions`, may prompt the user for file access permissions. In a subprocess context, stdin is either closed or piped, so the permission prompt causes the process to hang waiting for input that will never come, or it fails with an error about missing TTY.

**Why it happens:** Claude CLI is designed for interactive use. Permission checks are a safety feature. When invoked as a subprocess, the tool needs to explicitly opt into non-interactive mode. Developers test with their own Claude CLI configuration (which may have permissions pre-approved) and miss this issue.

**Consequences:**
- Subprocess hangs waiting for user input
- Process timeout fires, file is marked as failed
- Works on developer's machine (permissions cached), fails on fresh install
- Confusing error messages about TTY or permission denied

**Prevention:**
- ALWAYS pass `--print` flag (required for non-interactive use)
- Use `--permission-mode bypassPermissions` OR `--dangerously-skip-permissions` for subprocess invocations
- BUT understand the security implication: this bypasses ALL permission checks
- Alternative: use `--allowedTools "Read"` to only allow Read tool (sufficient for analysis), preventing writes
- Set `stdin` to `'pipe'` in spawn options and close it after writing prompt: `child.stdin.end()`
- Test with a fresh Claude CLI installation (no cached permissions)
- Catch and handle the "workspace trust" dialog skip that `--print` mode enables (as noted in Claude CLI help text)

**Warning signs:**
- Works in development, hangs in CI or on other machines
- Process exits with unexpected exit code (1) and no useful stderr
- Works for some files but not others (permission-dependent on file paths)

**Detection:** Monitor for processes that have received no stdout data within 10 seconds of spawn -- likely waiting for input.

**Phase to address:** Phase 1 (AI Service) -- must be correct from first subprocess invocation.

---

### Pitfall 9: Concurrency Limits and Rate Limiting Causing Cascading Failures

**What goes wrong:** The tool spawns N concurrent LLM calls (e.g., 5 in parallel for file analysis). The LLM API behind the CLI has rate limits. When limits are hit, ALL concurrent calls fail or are throttled simultaneously. The retry logic fires for ALL calls at once, creating a "retry storm" that hits the rate limit again. Or worse, the CLI handles rate limits internally with backoff, so N processes are all sleeping for increasing durations, consuming memory and process table entries.

**Why it happens:** This project will process potentially hundreds of files per run. Even with concurrency=5, that is hundreds of sequential batches. Rate limits vary by plan tier, time of day, and API load. The Claude CLI may or may not handle rate limits internally (it likely does for interactive use, but behavior under `--print` may differ).

**Consequences:**
- All concurrent calls fail, requiring full retry of the batch
- Rate limit errors propagate as file analysis failures
- Exponential backoff across N processes means N * backoff delay of idle waiting
- Memory pressure from N spawned processes all in backoff sleep state
- API billing for failed calls (some providers charge for rate-limited requests)

**Prevention:**
- Use a semaphore/pool pattern, NOT raw `Promise.all`:
  ```typescript
  // Pool with configurable concurrency
  async function processWithPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
    const executing = new Set<Promise<void>>();
    for (const item of items) {
      const p = fn(item).then(() => executing.delete(p));
      executing.add(p);
      if (executing.size >= concurrency) await Promise.race(executing);
    }
    await Promise.all(executing);
  }
  ```
- Start with conservative concurrency (2-3), allow user to configure
- Implement jittered exponential backoff at the ORCHESTRATOR level, not per-call
- If ANY call returns a rate limit error, pause ALL new calls for a backoff period
- Monitor successive failures: if 3 calls fail in a row, reduce concurrency to 1
- Add a delay between calls (e.g., 500ms minimum) even when not rate-limited
- Make concurrency configurable in `.agents-reverse-engineer/config.yaml`

**Warning signs:**
- Burst of errors followed by silence, repeated cyclically
- All files in a batch marked as "failed" simultaneously
- Longer runtimes than expected (hidden backoff delays)

**Detection:** Track error rate per minute. If it spikes, automatically reduce concurrency.

**Phase to address:** Phase 1 (AI Service) -- concurrency control is part of the process pool design.

---

### Pitfall 10: Context Density Over-Compression Losing Actionable Detail

**What goes wrong:** In pursuit of "higher-density" AGENTS.md output, summaries are compressed to the point where they lose the details that make them useful for AI assistants. A file summary like "Handles configuration loading and validation" is compressed but useless -- an AI assistant cannot determine which functions to call, what edge cases exist, or how to modify the configuration system.

**Why it happens:** "Context density" is measured subjectively. Without explicit quality criteria, developers optimize for brevity (fewer tokens = higher density) rather than information density (more useful information per token). The LLM prompt says "be concise" and the LLM complies by removing specifics.

**Consequences:**
- AGENTS.md files that read like generic README descriptions
- AI assistants cannot find the right file for a given task
- Summaries lose function signatures, type names, and API surface
- The documentation system provides little value over no documentation at all

**Prevention:**
- Define "density" as information-per-token, not tokens-per-file
- Specify WHAT must be preserved in compressed summaries:
  - Exported function/class/type names (exact names, always)
  - Parameter types for public interfaces
  - Import paths (which modules depend on this file)
  - File's role in the architecture (what calls it, what it calls)
- Specify WHAT can be dropped:
  - Implementation details of private functions
  - Verbose descriptions of obvious behavior
  - Repeated boilerplate patterns
- Use structured output formats (YAML frontmatter + prose) to ensure structured data survives compression
- Test summaries with a "findability" test: given a user query, can an AI find the right file using only the summaries?
- Keep the existing .sum format (YAML frontmatter with `public_interface`, `dependencies`, `patterns`) as structured data that is NEVER compressed
- Compress only the prose section; keep frontmatter at full detail

**Warning signs:**
- Summaries use words like "various," "utilities," "helpers," "different"
- No concrete function names or type names in directory-level AGENTS.md
- AI assistants consistently fail to find the right file when asked

**Detection:** Parse generated summaries and count the number of specific identifiers (function names, types, paths) per 100 tokens. A threshold below 2 identifiers per 100 tokens indicates over-compression.

**Phase to address:** Phase 4 (Context Density) -- define quality metrics before implementing compression.

---

### Pitfall 11: Inconsistency Detection False Positives Eroding Trust

**What goes wrong:** The inconsistency detection system flags "inconsistencies" that are not actually problems: documentation written in a different style than code comments, intentional differences between interfaces and implementations, TODO comments that are tracked elsewhere, or type assertions that are valid but look suspicious. Users get flooded with false positives and ignore all warnings, including the real ones.

**Why it happens:** Inconsistency detection compares text to code, which requires understanding intent. An LLM can detect surface-level mismatches (function signature changed but docs say old signature) but struggles with semantic mismatches (docs say "handles errors" but error handling was intentionally removed because errors are now handled upstream).

**Consequences:**
- Users disable inconsistency detection entirely due to noise
- Real inconsistencies are buried in false positives
- Processing time wasted analyzing non-issues
- Loss of trust in the tool's intelligence

**Prevention:**
- Start with HIGH-confidence inconsistencies only:
  - Function/method signature in .sum file does not match actual code (verifiable by AST or text matching)
  - File listed in AGENTS.md does not exist (verifiable by filesystem check)
  - Import path in .sum `dependencies` field points to nonexistent file
- Do NOT start with:
  - "Documentation says X but code does Y" (too subjective)
  - Style differences between docs and code
  - "This code looks like it should have error handling" (prescriptive, not descriptive)
- Classify detections by confidence: HIGH (verifiable mismatch), MEDIUM (likely mismatch), LOW (possible mismatch)
- Default to showing only HIGH confidence
- Allow users to suppress specific types via configuration
- Track false positive rate: if users mark >30% as "not an issue," reduce sensitivity

**Warning signs:**
- Users report "every file has inconsistencies" after initial detection run
- Inconsistency reports contain vague language like "may be inconsistent"
- Detection time dominates total processing time

**Detection:** Track the ratio of flagged inconsistencies to total files. If >50% of files are flagged, the detector is too sensitive.

**Phase to address:** Phase 3 (Inconsistency Detection) -- start strict, loosen based on feedback.

---

## Minor Pitfalls

Mistakes that cause annoyance, confusion, or rework but are recoverable.

---

### Pitfall 12: Encoding Issues with Non-UTF-8 File Content in Prompts

**What goes wrong:** The tool reads file content and embeds it in a prompt sent to the CLI. Some files contain non-UTF-8 bytes (legacy encodings, binary markers in text files, BOM characters, Windows CRLF in mixed-encoding repos). These bytes become garbled or cause the CLI to reject the prompt.

**Prevention:**
- Read files as `utf-8` with `{ encoding: 'utf-8' }` -- Node.js will replace invalid bytes
- Strip BOM characters: `content.replace(/^\uFEFF/, '')`
- Normalize line endings to LF: `content.replace(/\r\n/g, '\n')`
- Skip files that are detected as binary by the existing binary detection system (already implemented)
- For files with mixed encoding, log a warning and skip -- do not send garbage to the LLM

**Phase to address:** Phase 1 (AI Service) -- handle during prompt construction.

---

### Pitfall 13: Exit Code Semantics Differing Between CLI Tools

**What goes wrong:** The tool interprets exit code 0 as success and non-zero as failure. But CLI tools use exit codes differently: exit code 1 might mean "error" for Claude CLI but "warning" for another tool. Some CLIs exit with 0 even when the LLM response indicates an error (e.g., "I cannot analyze this file").

**Prevention:**
- Never rely solely on exit code for success/failure determination
- Check BOTH exit code AND output content
- For Claude CLI with `--output-format json`: parse the JSON and check for error fields
- For text mode: check that output is non-empty and does not start with common error patterns
- Define per-adapter validation: `isSuccessfulResponse(exitCode: number, output: string): boolean`
- Log exit codes in telemetry for every call

**Phase to address:** Phase 1 (AI Service) -- part of the adapter layer.

---

### Pitfall 14: Prompt Size Exceeding CLI Argument Limits

**What goes wrong:** The user prompt contains the full source file content. For large files (5,000+ lines), the prompt can be 50-200KB. Command-line argument length limits are:
- Linux: ~2MB (configurable via `getconf ARG_MAX`)
- macOS: ~262KB
- Windows: ~32KB

Passing the prompt as a CLI argument fails silently or with a cryptic error.

**Prevention:**
- ALWAYS pass the user prompt via stdin, never as a command-line argument
- The system prompt (short, <1KB) can safely be a `--system-prompt` argument
- Implementation: `const child = spawn('claude', ['-p', '--system-prompt', systemPrompt, '--output-format', 'json']); child.stdin.write(userPrompt); child.stdin.end();`
- For Claude CLI specifically: the positional `prompt` argument should be omitted when piping via stdin
- Test with a file that is >100KB of source content to verify stdin piping works

**Phase to address:** Phase 1 (AI Service) -- architecture decision, not a fix.

---

### Pitfall 15: Telemetry Correlation Between Related Calls

**What goes wrong:** A single file may generate multiple LLM calls: chunk 1, chunk 2, chunk 3, then a synthesis call. Telemetry logs each as a separate entry with no correlation. When debugging "why is file X's summary bad?", the developer must manually match entries by filename and timestamp, which is error-prone for concurrent runs.

**Prevention:**
- Assign a `runId` (UUID) to each generation run
- Assign a `fileId` (hash of relative path) to each file
- Assign a `callId` (UUID) to each individual LLM call
- Structure: `{ runId, fileId, callId, callType: 'chunk'|'synthesis'|'file'|'directory', sequenceNumber: 1 }`
- Log parent-child relationships: synthesis call references its chunk call IDs
- Include `runId` in the log file name: `logs/run-{runId}.ndjson`
- This also enables: "show me all calls for file X" and "show me the total cost of run Y"

**Phase to address:** Phase 2 (Telemetry) -- define correlation schema before writing first log entry.

---

### Pitfall 16: `--model` Flag Behavior Differences

**What goes wrong:** The tool hardcodes a model name (e.g., `claude-sonnet-4-5-20250929`) in the `--model` flag. This model ID becomes invalid when Anthropic releases new versions. Or the user's API plan does not include that model. The tool fails with an auth/model error that is not clearly surfaced.

**Prevention:**
- Use model aliases, not full model IDs: `--model sonnet` instead of `--model claude-sonnet-4-5-20250929` (Claude CLI supports aliases)
- Make model configurable in `.agents-reverse-engineer/config.yaml`
- Default to a stable alias (e.g., `sonnet`) that the CLI resolves to the latest version
- Catch and report model-related errors clearly: "Model 'X' not available. Check your API plan or configure a different model."
- Do not hardcode model names in source code -- use configuration

**Phase to address:** Phase 1 (AI Service) -- configuration design.

---

### Pitfall 17: Memory Pressure from Many Concurrent Spawned Processes

**What goes wrong:** Each spawned process (Claude CLI) is a full Node.js application with its own memory footprint (50-200MB depending on the CLI implementation). Spawning 5 concurrently means 250MB-1GB of additional memory beyond the parent process. On memory-constrained systems (CI runners, low-end machines), this causes OOM kills.

**Prevention:**
- Start with concurrency of 2 (safe on 4GB machines) and allow configuration up to 5-10
- Monitor system memory before spawning new processes (Node.js `os.freemem()`)
- Implement backpressure: if free memory drops below 500MB, reduce concurrency to 1
- Consider using `--no-session-persistence` flag on Claude CLI to reduce its memory footprint
- Log peak memory usage in telemetry
- Document minimum system requirements: "Recommended: 8GB RAM for concurrent processing"

**Phase to address:** Phase 1 (AI Service) -- concurrency configuration.

---

### Pitfall 18: Refactoring Existing Executor to Use AI Service Without Breaking Existing Functionality

**What goes wrong:** The existing `GenerationOrchestrator` and `buildExecutionPlan` create tasks that are currently consumed by the host AI tool (Claude Code/OpenCode) as markdown plans. v2.0 needs to execute these tasks directly via CLI subprocesses. Developers either:
1. Gut the existing system and replace it, breaking the v1.0 flow
2. Copy-paste the task creation logic into a new module, creating divergence
3. Add conditional paths ("if AI service available, use it; else, use plan mode") creating unmaintainable branching

**Consequences:**
- v1.0 users who rely on the plan-based workflow lose functionality
- Two codepaths for the same logic means bugs in one but not the other
- Configuration becomes confusing: which mode am I in?

**Prevention:**
- The existing `ExecutionTask` interface already defines tasks with prompts, dependencies, and output paths -- this IS the interface the AI service needs
- Keep the task creation pipeline (orchestrator + executor) UNCHANGED
- Add a NEW execution engine that consumes `ExecutionPlan` by spawning CLI subprocesses instead of outputting markdown
- The execution engine is a STRATEGY: plan-mode (write markdown) vs ai-service-mode (spawn processes)
- Both strategies consume the same `ExecutionPlan` -- this is the integration point
- The `--execute` flag already exists for programmatic use; the AI service mode is the natural evolution
- Introduce the AI service as a new command (`are generate --ai-service claude`) rather than replacing the existing flow
- Deprecate plan mode later, after AI service mode is proven stable

**Warning signs:**
- Merge conflicts between plan-mode and ai-service-mode code
- Bug fixes required in two places
- "This works in plan mode but not in AI service mode" reports

**Detection:** Both execution strategies should produce identical .sum files given identical inputs. Run both and diff outputs as an integration test.

**Phase to address:** Phase 1 (AI Service) -- architecture the strategy pattern before implementing.

---

### Pitfall 19: Inconsistency Detection Performance Impact on Large Codebases

**What goes wrong:** Inconsistency detection requires comparing documentation content against source code. For each file, this means: reading the .sum file, reading the source file, comparing function signatures, checking import paths, validating references. For a 1,000-file project, that is 2,000 file reads plus comparison logic. If the comparison involves LLM calls (asking the LLM "is this doc consistent with this code?"), it DOUBLES the number of LLM calls.

**Prevention:**
- Separate inconsistency detection into two tiers:
  - **Static checks** (no LLM): file existence, import path validity, function name matching -- these are FAST
  - **Semantic checks** (LLM required): "does the description match the implementation?" -- these are EXPENSIVE
- Run static checks by default; make semantic checks opt-in
- Cache check results: if file hash hasn't changed since last check, skip re-checking
- Integrate static checks INTO the generation pipeline (check as you generate) rather than as a separate pass
- For semantic checks, batch multiple file comparisons into a single LLM call where possible

**Phase to address:** Phase 3 (Inconsistency Detection) -- design tiered approach.

---

### Pitfall 20: Claude CLI `--json-schema` for Structured Output Validation

**What goes wrong:** The Claude CLI supports `--json-schema` to enforce structured output. Developers use this to enforce .sum file format directly. But: the schema validation happens inside the CLI, and if the LLM's response does not match the schema, the CLI may retry internally (consuming extra tokens), return an error, or return a best-effort result that does not match the schema. The behavior is undocumented for edge cases.

**Prevention:**
- Use `--json-schema` as a HINT, not a guarantee
- Always validate the returned JSON independently in your code (with zod)
- Consider NOT using `--json-schema` and instead using the system prompt to specify format, then parsing/validating on the tool side -- this gives you full control over retry behavior
- If using `--json-schema`, test with deliberately adversarial file content (minified code, binary-looking text) to see how the CLI handles schema validation failures
- Log whether the response matched the schema on the first try or required CLI-internal retries

**Phase to address:** Phase 1 (AI Service) -- evaluate during adapter implementation, not a hard requirement.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: AI Service Abstraction | stdout deadlock, shell injection, permission mode hangs, argument size limits | Use spawn with streams, stdin for prompts, explicit permission bypass, adapter pattern |
| Phase 1: Process Management | Zombie processes, memory pressure, concurrency cascading failures | AbortController, process tracking, adaptive concurrency, jittered backoff |
| Phase 2: Telemetry | Log file growth, crash-incomplete logs, correlation between calls | NDJSON with levels, write-ahead logging, runId/fileId/callId schema |
| Phase 3: Inconsistency Detection | False positives, performance impact | Start with verifiable-only checks, tiered static/semantic approach |
| Phase 4: Context Density | Over-compression, loss of identifiers | Define density metrics, preserve structured frontmatter, findability testing |
| Phase 5: Refactor Integration | Breaking existing v1.0 flow | Strategy pattern, same ExecutionPlan consumed by both execution engines |

## Integration Warnings for Existing Codebase

| Existing Component | v2.0 Risk | Mitigation |
|---|---|---|
| `GenerationOrchestrator` (orchestrator.ts) | Task creation logic must serve both plan-mode and AI-service-mode | Keep orchestrator unchanged; add execution strategy below it |
| `buildExecutionPlan` (executor.ts) | ExecutionPlan format must remain stable as AI service consumes it | Treat ExecutionPlan as a contract; version if schema changes |
| `BudgetTracker` (budget/tracker.ts) | Token estimates may diverge from actual LLM usage reported by CLI | Reconcile estimated vs actual tokens; adjust future estimates based on telemetry |
| `buildPrompt` / templates (prompts/) | Prompts designed for host-tool execution may need adaptation for direct CLI invocation | System prompt goes to `--system-prompt`, user prompt to stdin; test prompt quality in both modes |
| Config schema (config/schema.ts) | Needs new fields for AI service config (model, concurrency, CLI path, telemetry level) | Add optional fields with defaults; maintain backward compatibility |
| Logger (output/logger.ts) | Console logging may conflict with subprocess stdout capture | AI service should use separate log stream; not console.log which mixes with child process management output |

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| stdout deadlock | LOW | Kill stuck process, retry with timeout |
| JSON parse failure | LOW | Fall back to text mode, re-run single file |
| Zombie processes | LOW | `pkill -f claude` to clean up, restart run |
| Log file too large | LOW | Delete/rotate log, adjust log level |
| Incomplete telemetry | MEDIUM | Cross-reference .sum files with logs, fill gaps |
| Rate limit cascade | LOW | Wait, reduce concurrency, retry |
| Over-compressed summaries | MEDIUM | Re-run with adjusted prompts/templates |
| False positive flood | LOW | Raise confidence threshold, re-run detection |
| Broken v1.0 flow | HIGH | Revert to v1.0 execution path, fix strategy pattern |

## "Looks Done But Isn't" Checklist

- [ ] **stdout deadlock**: Test with a 100KB source file producing a long response -- does the subprocess complete?
- [ ] **Permission mode**: Test on a fresh machine with no cached Claude CLI permissions -- does it hang?
- [ ] **Timeout + cleanup**: Kill the parent process mid-run (`kill -9`) -- are child processes cleaned up?
- [ ] **Encoding**: Test with a file containing BOM, CRLF, and non-ASCII characters in the path
- [ ] **Rate limiting**: Run with concurrency=5 against the API -- does it handle rate limits gracefully?
- [ ] **Telemetry crash**: Kill the process during an LLM call -- is the telemetry entry in STARTED state recoverable?
- [ ] **Log rotation**: Run 10 times on a large project -- how big is the log directory?
- [ ] **Plan mode preserved**: Does `are generate` (without `--ai-service`) still work exactly as v1.0?
- [ ] **Gemini adapter**: Does the same test suite pass for Gemini CLI as for Claude CLI?
- [ ] **Memory**: Monitor RSS during a 500-file run with concurrency=3 -- does it stay under 2GB?
- [ ] **Inconsistency false positives**: Run detection on a known-good project -- are fewer than 5% of files flagged?
- [ ] **Context density**: Compare old and new summaries on a sample directory -- are specific identifiers still present?

## Sources

- Claude CLI `--help` output (verified on local machine, 2026-02-07) -- HIGH confidence for flag names and descriptions
- Node.js `child_process` documentation (training data) -- HIGH confidence for spawn/exec behavior, buffer sizes, signal handling
- NDJSON specification (training data) -- HIGH confidence
- Existing codebase analysis: `orchestrator.ts`, `executor.ts`, `budget/tracker.ts`, `prompts/builder.ts`, `config/schema.ts` -- HIGH confidence for integration risks
- Gemini CLI behavior -- LOW confidence (not verified locally, based on training data)
- OpenCode subprocess invocation -- LOW confidence (limited documentation available)

---
*Pitfalls research for: agents-reverse-engineer v2.0 -- AI CLI Subprocess Orchestration, Telemetry & Context Density*
*Researched: 2026-02-07*
