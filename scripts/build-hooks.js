#!/usr/bin/env node
/**
 * Build Hooks Script
 *
 * Copies hook source files from hooks/ to hooks/dist/ for npm bundling.
 * Run via: npm run build:hooks
 * Called automatically during: npm run prepublishOnly
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const HOOKS_SRC = join(projectRoot, 'hooks');
const HOOKS_DIST = join(projectRoot, 'hooks', 'dist');

// Ensure dist directory exists
if (!existsSync(HOOKS_DIST)) {
  mkdirSync(HOOKS_DIST, { recursive: true });
}

// Copy all .js files from hooks/ to hooks/dist/
const hookFiles = readdirSync(HOOKS_SRC).filter(
  (f) => f.endsWith('.js') && f !== 'dist'
);

console.log('Building hooks...');
for (const file of hookFiles) {
  const src = join(HOOKS_SRC, file);
  const dest = join(HOOKS_DIST, file);
  copyFileSync(src, dest);
  console.log(`  Copied: ${file} -> hooks/dist/${file}`);
}

console.log(`Done. ${hookFiles.length} hook(s) built.`);
