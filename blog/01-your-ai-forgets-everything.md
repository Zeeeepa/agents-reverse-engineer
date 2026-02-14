# Your AI Assistant Forgets Everything: Here's the Fix

You open a new chat. Again.

"It's a Next.js 15 app using App Router with tRPC and Drizzle ORM. Auth is handled by Supabase in `src/lib/auth/`, the database schema is in `src/db/schema.ts`, and all inputs are validated with Zod..."

Sound familiar? This scenario is rarer now than it used to be — but it still happens, and it's not the only problem.

## The Real Problem: Discovery Is Expensive

Modern AI assistants have gotten good at exploring codebases on their own. Tools like `grep`, `find`, and `Read` let them crawl through your project, trace imports, and piece together the architecture. They'll get there eventually.

But "eventually" has a cost. Every file read burns tokens. Every search round-trip adds latency. A single question like "how does auth work here?" can trigger dozens of tool calls — the AI grepping for patterns, reading file after file, backtracking when it follows the wrong lead. You're paying for that exploration in both time and money, and it happens **every single session**.

The AI isn't broken. It's just doing archaeology every time it opens your project.

## What If Your AI Already Knew?

Imagine typing: "Add password reset functionality." No preamble. No architecture explanation. No waiting while the AI reads 30 files to understand your auth setup.

Your AI responds with code that follows your patterns, uses your middleware, fits your structure — in seconds, not minutes. Because it already knows, from message one.

## Introducing agents-reverse-engineer

**agents-reverse-engineer** (`are`) is a CLI tool that solves this. It generates AI-friendly documentation your assistant automatically reads:

1. **Analyzes every file** using AI to understand purpose, exports, and dependencies
2. **Generates `.sum` files** — compact summaries per source file
3. **Creates `AGENTS.md` files** — directory-level overviews aggregating child summaries
4. **Installs session hooks** — automatic integration with Claude Code, Codex, Gemini CLI, and OpenCode

## How It Works

```bash
npx agents-reverse-engineer@latest
```

One command. The installer guides you through setup. Then:

```bash
npx are init       # Initialize configuration
npx are discover   # Scan your project
npx are generate   # Generate documentation
```

Under the hood, `are` runs a two-phase pipeline: **file analysis** spawns parallel AI calls producing `.sum` files, then **directory aggregation** performs post-order traversal building `AGENTS.md` from deepest directories upward.

Session hooks inject parent directory context after Read tool calls. The `are-context-loader` hook tracks loaded directories, preventing redundant loads. Updates run incrementally — `npx are update` re-analyzes only changed files using SHA-256 content hashing.

## The Result

Your next AI session is fundamentally different. Ask architectural questions and get informed answers. Request features and get implementations that fit your patterns. Documentation stays in sync automatically.

No more explaining your codebase. No more waiting while the AI greps its way through your project. No more burning tokens on rediscovery.

```bash
npx agents-reverse-engineer@latest
```

Fewer tokens. Faster answers. Better code. Stop paying for rediscovery. Start building.

---

**agents-reverse-engineer** — MIT licensed | [GitHub](https://github.com/GeoloeG-IsT/agents-reverse-engineer) | npm: `agents-reverse-engineer` v0.9.9
