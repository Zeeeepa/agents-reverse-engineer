#!/usr/bin/env node
/**
 * ARE Session End Hook
 *
 * Triggers `are update` when session ends (if there are uncommitted changes).
 * Runs in background to avoid blocking session close.
 *
 * Disable via:
 * - Environment variable: ARE_DISABLE_HOOK=1
 * - Config file: hook_enabled: false in .agents-reverse-engineer.yaml
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';

// Check for disable flag
if (process.env.ARE_DISABLE_HOOK === '1') {
  process.exit(0);
}

// Check config file for permanent disable
const configPath = '.agents-reverse-engineer.yaml';
if (existsSync(configPath)) {
  const config = readFileSync(configPath, 'utf-8');
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
const child = spawn('npx', ['agents-reverse-engineer@latest', 'update', '--quiet'], {
  stdio: 'ignore',
  detached: true,
});
child.unref();
