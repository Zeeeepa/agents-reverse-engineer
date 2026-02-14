# Your AI Assistant Forgets Everything: Here's the Fix

You open a new chat. Again.

"It's a Next.js 15 app using App Router with tRPC and Drizzle ORM. Auth is handled by Supabase in `src/lib/auth/`, the database schema is in `src/db/schema.ts`, and all inputs are validated with Zod..."

Sound familiar? Every conversation starts from zero. You're the tour guide to your own codebase.

## The Context Problem

AI coding tools work in isolated sessions. They can't remember your codebase between conversations. The workarounds — pasting code into every chat, maintaining docs that go stale, hoping the AI reads the right files — aren't real solutions.

## What If Your AI Already Knew?

Imagine typing: "Add password reset functionality." No preamble. No architecture explanation.

Your AI responds with code that follows your patterns, uses your middleware, fits your structure. Because it already knows, from message one.

## Introducing agents-reverse-engineer

**agents-reverse-engineer** (`are`) is a CLI tool that solves this. It generates AI-friendly documentation your assistant automatically reads:

1. **Analyzes every file** using AI to understand purpose, exports, and dependencies
2. **Generates `.sum` files** — compact summaries per source file
3. **Creates `AGENTS.md` files** — directory-level overviews aggregating child summaries
4. **Installs session hooks** — automatic integration with Claude Code, Gemini CLI, and OpenCode

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

Under the hood, `are` runs a two-phase pipeline: **file analysis** spawns parallel AI calls producing `.sum` files, then **directory aggregation** performs post-order traversal building `AGENTS.md` from deepest directories upward. Claude Code natively reads `AGENTS.md`, so context loads automatically.

Session hooks inject parent directory context after Read tool calls. The `are-context-loader` hook tracks loaded directories, preventing redundant loads. Updates run incrementally — `npx are update` re-analyzes only changed files using SHA-256 content hashing.

## The Result

Your next AI session is fundamentally different. Ask architectural questions and get informed answers. Request features and get implementations that fit your patterns. Documentation stays in sync automatically.

No more explaining your codebase. No more pasting boilerplate. No more "which file was that in?"

```bash
npx agents-reverse-engineer@latest
```

Your next AI session will feel like magic. Stop explaining. Start building.

---

**agents-reverse-engineer** — MIT licensed | [GitHub](https://github.com/GeoloeG-IsT/agents-reverse-engineer) | npm: `agents-reverse-engineer` v0.9.9
