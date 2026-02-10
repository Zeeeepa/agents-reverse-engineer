#!/usr/bin/env bash
# Verify Due Date feature implementation
# Usage: verify-duedate.sh <repo-path> [--json]
set -uo pipefail

REPO_PATH="${1:?Usage: verify-duedate.sh <repo-path> [--json]}"
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

# Detect backend/frontend directory names
BACKEND_DIR=$(find "$REPO_PATH" -maxdepth 1 -type d \( -iname "backend" -o -iname "back-end" \) | head -1)
FRONTEND_DIR=$(find "$REPO_PATH" -maxdepth 1 -type d \( -iname "frontend" -o -iname "front-end" \) | head -1)

# 1. dueDate field in entity
if [[ -n "$BACKEND_DIR" ]]; then
  grep -r -l "dueDate\|due_date" "$BACKEND_DIR" --include="*.entity.ts" 2>/dev/null | grep -q .
  check "entity-duedate" $?
else
  check "entity-duedate" 1
fi

# 2. dueDate in CreateTodoDto
if [[ -n "$BACKEND_DIR" ]]; then
  grep -r -l "dueDate\|due_date" "$BACKEND_DIR" --include="*create*dto*" 2>/dev/null | grep -q .
  check "create-dto-duedate" $?
else
  check "create-dto-duedate" 1
fi

# 3. dueDate in UpdateTodoDto
if [[ -n "$BACKEND_DIR" ]]; then
  grep -r -l "dueDate\|due_date" "$BACKEND_DIR" --include="*update*dto*" 2>/dev/null | grep -q .
  check "update-dto-duedate" $?
else
  check "update-dto-duedate" 1
fi

# 4. dueDate in frontend ITodo interface
if [[ -n "$FRONTEND_DIR" ]]; then
  grep -r "dueDate\|due_date" "$FRONTEND_DIR" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -qi "interface\|dueDate\|due_date"
  check "frontend-interface-duedate" $?
else
  check "frontend-interface-duedate" 1
fi

# 5. Overdue endpoint in controller
if [[ -n "$BACKEND_DIR" ]]; then
  grep -r -i "overdue" "$BACKEND_DIR" --include="*.controller.ts" --include="*.service.ts" 2>/dev/null | grep -q .
  check "overdue-endpoint" $?
else
  check "overdue-endpoint" 1
fi

# 6. Date input in frontend
if [[ -n "$FRONTEND_DIR" ]]; then
  grep -r -E "type.*['\"]date['\"]|DatePicker|date-picker|input.*date|dueDate|due.date" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -q .
  check "frontend-date-input" $?
else
  check "frontend-date-input" 1
fi

# 7. Backend compiles
if [[ -n "$BACKEND_DIR" ]]; then
  (cd "$BACKEND_DIR" && npx tsc --noEmit 2>/dev/null)
  check "backend-compiles" $?
else
  check "backend-compiles" 1
fi

total=$((passed + failed))

if $JSON_OUTPUT; then
  checks_json=$(IFS=,; echo "${checks[*]}")
  echo "{\"passed\":$passed,\"failed\":$failed,\"total\":$total,\"success\":$([ $passed -ge 5 ] && echo true || echo false),\"checks\":[$checks_json]}"
else
  echo "=== Verification Results ==="
  echo "Passed: $passed / $total"
  echo "Threshold: 5 / $total"
  if [[ $passed -ge 5 ]]; then
    echo "Status: PASS"
  else
    echo "Status: FAIL"
  fi
fi
