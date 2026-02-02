---
name: bump
description: Bump version, update CHANGELOG.md and README.md, then tag and release on GitHub
argument-hint: "<version>"
---

Bump the project version, update documentation, create a git tag, and publish a GitHub release.

<execution>
## Prerequisites

- Version argument is REQUIRED (e.g., `/bump 0.4.0`)
- Must be on `main` branch with clean working tree
- `gh` CLI must be authenticated

## Phase 1: Validate

1. **Check version argument**:
   - If no version provided, STOP and ask: "Please provide a version (e.g., `/bump 0.4.0`)"
   - Version must be valid semver (e.g., `0.4.0`, `1.0.0-beta.1`)

2. **Check git status**:

   ```bash
   git status --porcelain
   ```

   - If there are uncommitted changes, STOP and report: "Working tree not clean. Commit or stash changes first."

3. **Check current branch**:

   ```bash
   git branch --show-current
   ```

   - Warn if not on `main` branch (but allow to proceed)

4. **Get current version**:
   ```bash
   node -p "require('./package.json').version"
   ```

## Phase 2: Update Files

### 2.1 Update package.json

Use the Edit tool to update the version field in `package.json`:

- Change `"version": "<old>"` to `"version": "<new>"`

### 2.2 Update CHANGELOG.md

Read `CHANGELOG.md` and make these changes:

1. **Find the `## [Unreleased]` section**

2. **If there are entries under [Unreleased]**:
   - Insert a new version section after `## [Unreleased]`:
     ```
     ## [<version>] - <YYYY-MM-DD>
     ```
   - Move all content from [Unreleased] to the new version section
   - Leave [Unreleased] empty (just the header)

3. **If [Unreleased] is empty**:
   - Still create the new version section
   - Add a placeholder: `### Changed\n- Version bump`

4. **Update the version links at the bottom**:
   - Update `[Unreleased]` link: `[Unreleased]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v<version>...HEAD`
   - Add new version link after [Unreleased]: `[<version>]: https://github.com/GeoloeG-IsT/agents-reverse-engineer/compare/v<previous>...v<version>`

### 2.3 Check README.md (Optional)

Scan `README.md` for any hardcoded version references that need updating:

- Badge URLs
- Installation commands with specific versions
- Only update if explicitly version-pinned (not `@latest`)

## Phase 3: Commit and Tag

1. **Stage changes**:

   ```bash
   git add package.json CHANGELOG.md README.md
   ```

2. **Create commit**:

   ```bash
   git commit -m "$(cat <<'EOF'
   chore: release v<version>
   EOF
   )"
   ```

3. **Create annotated tag**:
   ```bash
   git tag -a v<version> -m "Release v<version>"
   ```

## Phase 4: Push and Release

1. **Push commit and tag**:

   ```bash
   git push && git push --tags
   ```

2. **Create GitHub release**:
   Extract the changelog section for this version and use it as release notes:
   ```bash
   gh release create v<version> --title "v<version>" --notes "$(cat <<'EOF'
   <changelog section for this version>
   EOF
   )"
   ```

## Phase 5: Report

Summarize what was done:

- Version bumped: `<old>` → `<new>`
- Files updated: package.json, CHANGELOG.md, (README.md if changed)
- Git tag: `v<version>`
- GitHub release: link to the release

**Remind user**: The GitHub Actions workflow will automatically publish to npm when the release is created.
</execution>
