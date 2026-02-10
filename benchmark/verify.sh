#!/usr/bin/env bash
# Verify Tags/Labels feature implementation
# Usage: verify.sh <repo-path> [--json]
set -uo pipefail

REPO_PATH="${1:?Usage: verify.sh <repo-path> [--json]}"
JSON_OUTPUT=false
[[ "${2:-}" == "--json" ]] && JSON_OUTPUT=true

passed=0
failed=0
checks=()

check() {
  local name="$1"
  local result="$2"  # 0 = pass, non-zero = fail
  if [[ "$result" -eq 0 ]]; then
    checks+=("{\"name\":\"$name\",\"pass\":true}")
    ((passed++))
  else
    checks+=("{\"name\":\"$name\",\"pass\":false}")
    ((failed++))
  fi
}

# Detect backend/frontend directory names (may be "back-end" or "backend")
BACKEND_DIR=$(find "$REPO_PATH" -maxdepth 1 -type d \( -iname "backend" -o -iname "back-end" \) | head -1)
FRONTEND_DIR=$(find "$REPO_PATH" -maxdepth 1 -type d \( -iname "frontend" -o -iname "front-end" \) | head -1)

# 1. Tag entity exists
find "$REPO_PATH" -iname "*tag*entity*" -o -iname "*tag.entity*" 2>/dev/null | grep -q .
check "tag-entity" $?

# 2. Tag module exists
find "$REPO_PATH" -iname "*tag*module*" -o -iname "*tag.module*" 2>/dev/null | grep -q .
check "tag-module" $?

# 3. Tag controller exists
find "$REPO_PATH" -iname "*tag*controller*" -o -iname "*tag.controller*" 2>/dev/null | grep -q .
check "tag-controller" $?

# 4. Tag service exists
find "$REPO_PATH" -iname "*tag*service*" -o -iname "*tag.service*" 2>/dev/null | grep -q .
check "tag-service" $?

# 5. Tag DTO exists
find "$REPO_PATH" -iname "*tag*dto*" -o -iname "*tag*.dto*" 2>/dev/null | grep -q .
check "tag-dto" $?

# 6. Many-to-many relation
if [[ -n "$BACKEND_DIR" ]]; then
  grep -r -l "ManyToMany\|JoinTable" "$BACKEND_DIR" --include="*.ts" 2>/dev/null | grep -q .
  check "many-to-many" $?
else
  check "many-to-many" 1
fi

# 7. TagBadge frontend component
if [[ -n "$FRONTEND_DIR" ]]; then
  find "$FRONTEND_DIR" -iname "*tag*badge*" -o -iname "*TagBadge*" 2>/dev/null | grep -q .
  check "tag-badge-component" $?
else
  check "tag-badge-component" 1
fi

# 8. TagManager frontend component
if [[ -n "$FRONTEND_DIR" ]]; then
  find "$FRONTEND_DIR" -iname "*tag*manager*" -o -iname "*TagManager*" 2>/dev/null | grep -q .
  check "tag-manager-component" $?
else
  check "tag-manager-component" 1
fi

# 9. Backend compiles
if [[ -n "$BACKEND_DIR" ]]; then
  (cd "$BACKEND_DIR" && npx tsc --noEmit 2>/dev/null)
  check "backend-compiles" $?
else
  check "backend-compiles" 1
fi

total=$((passed + failed))

if $JSON_OUTPUT; then
  checks_json=$(IFS=,; echo "${checks[*]}")
  echo "{\"passed\":$passed,\"failed\":$failed,\"total\":$total,\"success\":$([ $passed -ge 6 ] && echo true || echo false),\"checks\":[$checks_json]}"
else
  echo "=== Verification Results ==="
  echo "Passed: $passed / $total"
  echo "Threshold: 6 / $total"
  if [[ $passed -ge 6 ]]; then
    echo "Status: PASS"
  else
    echo "Status: FAIL"
  fi
fi
