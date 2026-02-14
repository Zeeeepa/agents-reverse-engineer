# Incremental Updates: Keep Docs Fresh Without Regenerating Everything

Your codebase evolves daily with new features, bug fixes, and API refactors. Each change potentially invalidates your documentation. Regenerating all documentation from scratch after every change wastes time, API calls, and computational resources.

The agents-reverse-engineer (ARE) update system solves this by intelligently detecting what changed and regenerating only what's needed. Instead of re-analyzing hundreds of files, it identifies the handful that actually changed and propagates those updates through the documentation tree efficiently.

## The Update Command

Running incremental updates is straightforward:

```bash
npx agents-reverse-engineer update
```

The update command:

1. Scans existing `.sum` files to detect which source files changed
2. Regenerates documentation for changed files (Phase 1)
3. Propagates changes up the directory tree by regenerating affected `AGENTS.md` files (Phase 2)
4. Cleans up orphaned documentation for deleted files

This selective regeneration is orders of magnitude faster than a full `are generate` run.

## How Change Detection Works

The heart of the update system is content-based change detection. Every `.sum` file contains YAML frontmatter with a `content_hash` field—a SHA-256 hex digest of the source file's contents.

When you run `are update`, the system:

1. Reads existing frontmatter from all `.sum` files
2. Computes current SHA-256 hashes for each source file
3. Compares stored versus current hashes
4. Regenerates only files where hashes don't match

This approach is efficient and accurate. It doesn't rely on modification timestamps (unreliable with git operations) or git diffs (requiring a repository). It works purely on content—if the bytes changed, documentation gets updated.

## Directory Propagation

When a file's documentation changes, its parent directory's `AGENTS.md` file needs updating too. ARE handles this with `getAffectedDirectories()`, which collects all ancestor directories, sorts them by depth descending, and regenerates each `AGENTS.md` sequentially.

## Orphan Cleanup

When files get deleted, their `.sum` files become orphans. The `cleanupOrphans()` function automatically removes `.sum` and `.annex.sum` files for deleted source files. If a directory has no remaining source files, its `AGENTS.md` is also removed.

## The --uncommitted Flag

The `--uncommitted` flag filters to only files that `git status` reports as modified:

```bash
are update --uncommitted
```

Useful during active development when you want to preview documentation changes before committing.

## Automatic Updates with Session Hooks

The `are-session-end.js` hook runs when your AI session ends. It checks for git changes and runs `are update --quiet` in the background using detached spawning. Disable via `ARE_DISABLE_HOOK=1` or `hook_enabled: false` in config.

## Best Practices

1. Run updates after merging feature branches
2. Enable session hooks for automatic maintenance
3. Periodically run full regeneration (`are generate --force`)
4. Review orphan cleanup output to catch config issues
5. Use --uncommitted during active development
