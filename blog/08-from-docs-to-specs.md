# From Docs to Specs: Using are-specify to Generate Project Specifications

After running `are generate`, your codebase has comprehensive documentation distributed across `.sum` files and `AGENTS.md` directories. Every file is documented, every directory has a summary. But understanding the full architecture requires mentally stitching together dozens of files. What if you need a single, coherent document for onboarding, architecture reviews, or project handoffs?

That's what `are specify` does—it synthesizes distributed documentation into unified project specifications.

## What is are-specify?

The `specify` command reads all `AGENTS.md` files across your project and synthesizes them into a comprehensive specification at `specs/SPEC.md`. It's the "zoom out" command—instead of navigating individual directory summaries, you get a bird's-eye view of your entire system.

Unlike distributed, bottom-up `AGENTS.md` files, `SPEC.md` is centralized and top-down. The AI analyzes component relationships, identifies architectural patterns, extracts API surfaces, maps data flows, and organizes everything into a coherent narrative.

## Running the Command

```bash
npx agents-reverse-engineer specify
```

ARE discovers all `AGENTS.md` files, sends aggregated documentation to your AI backend, generates a structured specification, and writes it to `specs/SPEC.md`.

## The 12-Section Structure

1. **Project Overview** — Purpose and scope
2. **Architecture** — Design patterns and structural decisions
3. **Components/Modules** — Key subsystems and interactions
4. **Data Flow** — Information movement and transformation
5. **API Surface** — Public interfaces and integration points
6. **Dependencies** — External libraries and tools
7. **Configuration** — Config files and runtime options
8. **Deployment** — Build process and installation
9. **Testing Strategy** — Test organization and quality gates
10. **Security Considerations** — Authentication and threat mitigations
11. **Performance Characteristics** — Concurrency and optimization
12. **Extension Points** — Plugin systems and customization hooks

## Multi-File Mode

For large projects, use `--multi-file` to split the spec into separate files from `specs/01-overview.md` through `specs/12-extensions.md`, making navigation easier and enabling granular version control.

## Dry Run

Preview what will be processed before consuming API credits with `--dry-run`. This discovers files, calculates input size, shows planned sections, and exits without calling the AI.

## Use Cases

**Developer Onboarding** — New team members understand architecture before diving into code.

**Architecture Reviews** — Shared artifact for design discussions and architectural decision records.

**Project Handoffs** — Preserve institutional knowledge when transitioning between teams.

**AI Context** — Feed to ChatGPT, Copilot, or other AI tools that don't support `AGENTS.md` natively.

## Tips for Better Specs

Run quality checks first to validate documentation. Ensure critical components aren't excluded. Review and edit the generated spec—it's a starting point. Regenerate regularly as your codebase evolves. Commit specs to version control to track architectural evolution.
