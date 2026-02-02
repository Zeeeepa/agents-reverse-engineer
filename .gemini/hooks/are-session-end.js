#!/usr/bin/env node
// .claude/hooks/are-session-end.js
// Triggers are update when session ends (if there are uncommitted changes)

const { execSync, spawn } = require('child_process');
const fs = require('fs');

// Check for disable flag
if (process.env.ARE_DISABLE_HOOK === '1') {
  process.exit(0);
}

// Check config file for permanent disable
const configPath = '.agents-reverse-engineer.yaml';
if (fs.existsSync(configPath)) {
  const config = fs.readFileSync(configPath, 'utf-8');
  if (config.includes('hook_enabled: false')) {
    process.exit(0);
  }
}

// Check git status - skip if no changes
try {
  const status = execSync('git status --porcelain', { encoding: 'utf-8' });
  if (!status.trim()) {
    // No changes since last run - exit silently
    process.exit(0);
  }
} catch {
  // Not a git repo or git not available - exit silently
  process.exit(0);
}

// Run update in background (don't block session close)
const child = spawn('npx', ['are', 'update', '--quiet'], {
  stdio: 'ignore',
  detached: true,
});
child.unref();
