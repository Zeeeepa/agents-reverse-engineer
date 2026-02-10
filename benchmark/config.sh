#!/usr/bin/env bash
# Shared configuration for ARE E2E benchmark

# Test repository
BENCH_REPO_URL="https://github.com/htamagnus/to-do-fullstack-nestjs-react.git"

# Branch names
BENCH_BRANCH_WITHOUT="benchmark/without-are"
BENCH_BRANCH_WITH="benchmark/with-are"

# Trial settings
BENCH_TRIALS=3
BENCH_MODEL="sonnet"
BENCH_MAX_TURNS=50
BENCH_MAX_BUDGET_USD="5.00"
BENCH_TIMEOUT=900  # 15 min wall-clock cap

# Allowed tools — no Task to avoid subagent token accounting issues
BENCH_ALLOWED_TOOLS="Read,Write,Edit,Bash,Glob,Grep"

# Derived paths
BENCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_WORKSPACE="$BENCH_DIR/workspace"
BENCH_TEST_REPO="$BENCH_WORKSPACE/test-repo"
BENCH_RESULTS="$BENCH_DIR/results"
BENCH_PROMPT_FILE="$BENCH_DIR/prompt.md"
ARE_PROJECT_ROOT="$(dirname "$BENCH_DIR")"
