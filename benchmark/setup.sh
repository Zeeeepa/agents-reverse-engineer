#!/usr/bin/env bash
# One-time setup: clone test repo, create branches, generate ARE docs
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

echo "=== ARE Benchmark Setup ==="

# Resolve ARE command
if command -v are &>/dev/null; then
  ARE_CMD="are"
elif [[ -f "$ARE_PROJECT_ROOT/dist/cli/index.js" ]]; then
  ARE_CMD="node $ARE_PROJECT_ROOT/dist/cli/index.js"
else
  echo "ERROR: 'are' CLI not found. Run 'npm run build' in $ARE_PROJECT_ROOT first." >&2
  exit 1
fi
echo "Using ARE command: $ARE_CMD"

# Clone test repo
mkdir -p "$BENCH_WORKSPACE"
if [[ -d "$BENCH_TEST_REPO/.git" ]]; then
  echo "Test repo already cloned at $BENCH_TEST_REPO"
else
  echo "Cloning $BENCH_REPO_URL..."
  git clone "$BENCH_REPO_URL" "$BENCH_TEST_REPO"
fi

cd "$BENCH_TEST_REPO"

# Identify the default branch
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
echo "Default branch: $DEFAULT_BRANCH"

# Create without-are branch (clean, no docs)
if git rev-parse --verify "$BENCH_BRANCH_WITHOUT" &>/dev/null; then
  echo "Branch $BENCH_BRANCH_WITHOUT already exists"
else
  echo "Creating branch $BENCH_BRANCH_WITHOUT..."
  git checkout -b "$BENCH_BRANCH_WITHOUT" "origin/$DEFAULT_BRANCH"
  git checkout "$DEFAULT_BRANCH" 2>/dev/null || git checkout "$BENCH_BRANCH_WITHOUT"
fi

# Create with-are branch and generate ARE docs
if git rev-parse --verify "$BENCH_BRANCH_WITH" &>/dev/null; then
  echo "Branch $BENCH_BRANCH_WITH already exists"
else
  echo "Creating branch $BENCH_BRANCH_WITH..."
  git checkout -b "$BENCH_BRANCH_WITH" "origin/$DEFAULT_BRANCH"

  echo "Running ARE init..."
  $ARE_CMD init

  echo "Running ARE discover..."
  $ARE_CMD discover

  echo "Running ARE generate..."
  $ARE_CMD generate

  echo "Committing ARE artifacts..."
  git add -A
  git commit -m "chore: add ARE documentation artifacts for benchmark"

  git checkout "$DEFAULT_BRANCH" 2>/dev/null || git checkout "$BENCH_BRANCH_WITH"
fi

echo ""
echo "=== Setup Complete ==="
echo "Branches:"
echo "  - $BENCH_BRANCH_WITHOUT (clean)"
echo "  - $BENCH_BRANCH_WITH (with ARE docs)"
echo "Workspace: $BENCH_TEST_REPO"
