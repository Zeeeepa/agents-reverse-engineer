# Anatomy of Generated Documentation: .sum Files and AGENTS.md Explained

After running `agents-reverse-engineer`, new files appear: `.sum` files alongside source code, `AGENTS.md` in directories, and pointer files like `CLAUDE.md` at the root. Here's what they contain.

## .sum Files: Per-File Intelligence

For every source file, ARE generates a corresponding `.sum` file with two parts:

**YAML Frontmatter** contains:
- **`file_type`**: Categorizes the file (service, util, type, test)
- **`generated_at`**: ISO 8601 timestamp
- **`content_hash`**: SHA-256 hash enabling incremental updates. When running `are update`, ARE compares stored hash against current source. Only changed files get regenerated.

**Markdown Sections** provide documentation:
1. **Purpose**: What the file does
2. **Public Interface**: Exported functions, classes, types with signatures
3. **Dependencies**: What the file imports
4. **Implementation Notes**: Algorithms, patterns, limitations

ARE places `.sum` files next to source files for proximity. When AI reads `token-service.ts`, having `token-service.ts.sum` adjacent makes discovery trivial.

## AGENTS.md: Directory Overviews

Every directory containing source files gets an `AGENTS.md` providing high-level overviews:

1. **Directory description**: Paragraph explaining the directory's role
2. **Files section**: Groups files by purpose with bolded links and descriptions
3. **Subdirectories section**: Lists child directories creating navigable hierarchy

`AGENTS.md` is an emerging cross-tool standard recognized by Claude Code, Gemini CLI, and OpenCode.

When ARE encounters existing `AGENTS.md` files:
1. Renames your file to `AGENTS.local.md`
2. Creates new generated `AGENTS.md`
3. Injects `@AGENTS.local.md` directive at top

Your hand-written context is preserved through the directive.

## Pointer Files: Runtime Bridges

At project root, you'll find `CLAUDE.md`, `GEMINI.md`, or `OPENCODE.md` — single-line pointer files containing `@AGENTS.md`. Each AI runtime has auto-load conventions; ARE uses lightweight adapters pointing to universal `AGENTS.md` format.

## The Hierarchy

An AI assistant's journey:

1. Claude Code loads `/CLAUDE.md`
2. `CLAUDE.md` references `@AGENTS.md`, loading `/AGENTS.md`
3. `/AGENTS.md` references subdirectories like `src/`
4. Claude loads `/src/AGENTS.md`
5. When details needed, Claude reads individual `.sum` files

Each level provides progressively more detail.

## Quality Indicators

ARE runs quality gates: Code-vs-Doc Consistency verifies exported symbols are documented. Phantom Path Validation ensures file references exist. Code-vs-Code Checks detects duplicate symbols.

## Customizing Output

Configure via `.agents-reverse-engineer/config.yaml`: compression ratio, exclude patterns, and `AGENTS.local.md` for persistent custom context.

---

**Next**: [The Two-Phase Pipeline: How ARE Generates Documentation](./04-two-phase-pipeline.md)
