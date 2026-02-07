#!/usr/bin/env node
/**
 * ARE Session End Plugin for OpenCode
 *
 * Triggers `are update` when session ends (if there are uncommitted changes).
 * OpenCode equivalent of the Claude/Gemini SessionEnd hook.
 *
 * Runs in background to avoid blocking session close.
 *
 * Disable via:
 * - Environment variable: ARE_DISABLE_HOOK=1
 * - Config file: hook_enabled: false in .agents-reverse-engineer.yaml
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export const AreSessionEnd = async () => {
  return {
    event: {
      'session.deleted': async () => {
        // Check for disable flag
        if (process.env.ARE_DISABLE_HOOK === '1') return;

        // Check config file for permanent disable
        const configPath = '.agents-reverse-engineer.yaml';
        if (existsSync(configPath)) {
          const config = readFileSync(configPath, 'utf-8');
          if (config.includes('hook_enabled: false')) return;
        }

        // Check git status - skip if no changes
        try {
          const status = execSync('git status --porcelain', { encoding: 'utf-8' });
          if (!status.trim()) return;
        } catch {
          // Not a git repo or git not available - exit silently
          return;
        }

        // Run update in background (don't block session close)
        const child = spawn('npx', ['agents-reverse-engineer@latest', 'update', '--quiet'], {
          stdio: 'ignore',
          detached: true,
        });
        child.unref();
      },
    },
  };
};
