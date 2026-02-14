# Blog Post Roadmap — agents-reverse-engineer

> 12 articles, 3 per week, Feb 17 – Mar 13, 2026
> Progression: Introduction → Core Usage → Advanced Features → Tips & Tricks

---

## Week 1: Introduction & Getting Started (Feb 17–21)

### Article 1 — "Your AI Assistant Forgets Everything: Here's the Fix"
- **File**: `01-your-ai-forgets-everything.md`
- **Publish**: Mon Feb 17
- **Angle**: Problem-first hook — every AI session starts from zero, developers repeat themselves, context is lost
- **Topics**: The context problem in AI coding, what AGENTS.md and .sum files are, how ARE bridges the gap
- **Audience**: Any developer using AI coding assistants
- **CTA**: Install ARE and try it

### Article 2 — "Getting Started with agents-reverse-engineer in 5 Minutes"
- **File**: `02-getting-started-in-5-minutes.md`
- **Publish**: Wed Feb 19
- **Angle**: Hands-on quickstart — from zero to generated docs
- **Topics**: Installation (`npx agents-reverse-engineer@latest`), runtime selection (Claude/Gemini/OpenCode/Codex), `are init` → `are discover` → `are generate`, what the output looks like
- **Audience**: Developers ready to try ARE
- **CTA**: Run the commands, explore generated files

### Article 3 — "Anatomy of Generated Documentation: .sum Files and AGENTS.md Explained"
- **File**: `03-anatomy-of-generated-docs.md`
- **Publish**: Fri Feb 21
- **Angle**: Deep look at what ARE actually produces and why each piece matters
- **Topics**: .sum file YAML frontmatter + markdown sections, AGENTS.md directory overviews, CLAUDE.md/GEMINI.md/OPENCODE.md pointer files, how AI assistants consume these files
- **Audience**: Developers who've run ARE and want to understand the output
- **CTA**: Inspect your own generated files

---

## Week 2: Core Features Deep Dive (Feb 24–28)

### Article 4 — "The Two-Phase Pipeline: How ARE Understands Your Codebase"
- **File**: `04-two-phase-pipeline.md`
- **Publish**: Mon Feb 24
- **Angle**: Technical deep dive into the generation algorithm
- **Topics**: Phase 1 (file analysis with parallel AI calls), Phase 2 (post-order directory aggregation), depth-sorted batching, concurrency pool mechanics, why post-order traversal matters
- **Audience**: Technical developers curious about the internals
- **CTA**: Run with `--trace` flag and explore the trace output

### Article 5 — "Incremental Updates: Keep Docs Fresh Without Regenerating Everything"
- **File**: `05-incremental-updates.md`
- **Publish**: Wed Feb 26
- **Angle**: Practical guide to the update workflow
- **Topics**: `are update` command, content hash comparison (SHA-256), frontmatter-based staleness detection, affected directory propagation, orphan cleanup, `--uncommitted` flag, session-end hooks for automatic updates
- **Audience**: Teams using ARE in daily workflows
- **CTA**: Set up session hooks for automatic updates

### Article 6 — "Multi-Runtime Support: Claude Code, Gemini CLI, OpenCode, and Codex"
- **File**: `06-multi-runtime-support.md`
- **Publish**: Fri Feb 28
- **Angle**: Comparison of runtime support and how to use ARE across different AI assistants
- **Topics**: Runtime-specific installation, CLAUDE.md vs GEMINI.md vs OPENCODE.md vs AGENTS.override.md, feature parity matrix, slash commands per runtime, switching between runtimes, using `--runtime all`
- **Audience**: Developers who use multiple AI assistants or are choosing one
- **CTA**: Install for all runtimes and compare

---

## Week 3: Advanced Usage & Workflows (Mar 2–6)

### Article 7 — "Configuration Mastery: Tuning ARE for Your Project"
- **File**: `07-configuration-mastery.md`
- **Publish**: Mon Mar 2
- **Angle**: Complete guide to config.yaml customization
- **Topics**: Exclude patterns (globs, vendor dirs, binary extensions), concurrency tuning (auto-detection formula, manual override), timeout adjustment, model selection (`--model`, `--backend`), telemetry retention, `maxFileSize`, `followSymlinks`
- **Audience**: Power users managing large or complex codebases
- **CTA**: Optimize your config for your project size

### Article 8 — "From Docs to Specs: Using are-specify to Generate Project Specifications"
- **File**: `08-from-docs-to-specs.md`
- **Publish**: Wed Mar 4
- **Angle**: The specify command as a documentation synthesis tool
- **Topics**: `are specify` command, AGENTS.md → specs/SPEC.md transformation, `--multi-file` for split output, `--dry-run` preview, 12-section spec structure, use cases (onboarding, architecture reviews, project handoffs)
- **Audience**: Tech leads, architects, documentation-focused developers
- **CTA**: Generate a spec and use it for onboarding

### Article 9 — "Rebuilding from Specs: ARE's Code Reconstruction Pipeline"
- **File**: `09-rebuilding-from-specs.md`
- **Publish**: Fri Mar 6
- **Angle**: The rebuild command as the inverse of generate — from docs back to code
- **Topics**: `are rebuild` workflow, spec reading and phase partitioning, checkpoint management (resume on failure, drift detection), delimiter format (`===FILE: path===`), `builtContext` accumulation (100KB cap), practical use cases (scaffolding, migration, disaster recovery)
- **Audience**: Advanced users, architects exploring AI-driven code generation
- **CTA**: Try rebuilding a small project from its spec

---

## Week 4: Tips, Tricks & Expert Techniques (Mar 9–13)

### Article 10 — "10 Tips for Getting the Best Documentation from ARE"
- **File**: `10-tips-for-best-docs.md`
- **Publish**: Mon Mar 9
- **Angle**: Practical tips collected from real usage
- **Topics**: Structuring code for better summaries, keeping files focused (single responsibility), meaningful naming, excluding noise (test fixtures, generated code), choosing the right model, reviewing and editing .sum files, using AGENTS.local.md for custom instructions, compression ratio tuning, running quality checks, iterating on results
- **Audience**: All ARE users
- **CTA**: Apply 3 tips to your project today

### Article 11 — "Quality Gates and Debugging: ARE's Built-in Validation System"
- **File**: `11-quality-gates-debugging.md`
- **Publish**: Wed Mar 11
- **Angle**: Understanding and leveraging ARE's quality assurance features
- **Topics**: Post-phase-1 quality checks (code-vs-doc undocumented exports, code-vs-code duplicate symbols), post-phase-2 phantom path validation (markdown link checking, .js→.ts substitution), `--debug` flag for prompt inspection, `--trace` for concurrency analysis, reading trace NDJSON files, interpreting run logs, retry behavior and rate limit handling
- **Audience**: Developers troubleshooting or wanting high-quality output
- **CTA**: Run with `--debug --trace` and inspect the output

### Article 12 — "Integrating ARE into Your Team Workflow: CI/CD, Hooks, and Automation"
- **File**: `12-team-workflow-integration.md`
- **Publish**: Fri Mar 13
- **Angle**: Scaling ARE from individual use to team-wide adoption
- **Topics**: Session hooks (check-update, context-loader, session-end auto-update), Git integration (change detection, commit-triggered updates), CI/CD pipeline integration (GitHub Actions), programmatic API (`agents-reverse-engineer/core` @beta), team conventions (.agents-reverse-engineer.yaml shared config), disabling hooks (`ARE_DISABLE_HOOK=1`), version pinning via ARE-VERSION files, scaling for monorepos
- **Audience**: Team leads, DevOps engineers, developers setting up shared workflows
- **CTA**: Set up ARE in your team's CI pipeline

---

## Series Summary

| Week | Theme | Articles |
|------|-------|----------|
| 1 | Introduction & Getting Started | #1 Problem statement, #2 Quickstart, #3 Output anatomy |
| 2 | Core Features Deep Dive | #4 Pipeline internals, #5 Incremental updates, #6 Multi-runtime |
| 3 | Advanced Usage & Workflows | #7 Configuration, #8 Specify, #9 Rebuild |
| 4 | Tips, Tricks & Expert | #10 Best practices, #11 Quality/debugging, #12 Team integration |
