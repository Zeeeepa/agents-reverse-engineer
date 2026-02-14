# Your AI Assistant Forgets Everything: Here's the Fix

You open a new chat. Again.

"It's a Next.js 15 app using App Router with tRPC and Drizzle ORM. Auth is handled by Supabase in `src/lib/auth/`, the database schema is in `src/db/schema.ts`, and all inputs are validated with Zod..."

Sound familiar? This scenario is rarer now than it used to be — but it still happens, and it's not the only problem.

## The Real Problem: Discovery Is Expensive

Modern AI assistants have gotten good at exploring codebases on their own. Tools like `grep`, `find`, and `Read` let them crawl through your project and piece together the architecture. They'll get there eventually.

But "eventually" has a cost. Every file read burns tokens. Every search adds latency. A question like "how does auth work?" can trigger dozens of tool calls — the AI grepping, reading file after file, backtracking. You're paying for that exploration in time and money, **every session**.

The AI isn't broken. It's just doing archaeology every time it opens your project.

## What If Your AI Already Knew?

Imagine typing: "Add password reset functionality." No preamble. No waiting while the AI reads 30 files to understand your auth setup.

Your AI responds with code that follows your patterns, uses your middleware, fits your structure — in seconds. Because it already knows.

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

Under the hood, `are` runs a two-phase pipeline: parallel file analysis producing `.sum` files, then post-order directory aggregation building `AGENTS.md` from deepest directories upward.

Session hooks inject context automatically. Updates run incrementally — `are update` re-analyzes only changed files using content hashing.

## The Result

Your next AI session is different. Ask architectural questions and get informed answers. Request features and get code that fits your patterns.

No more explaining your codebase. No more burning tokens on rediscovery.

```bash
npx agents-reverse-engineer@latest
```

Fewer tokens. Faster answers. Better code.

---

**agents-reverse-engineer** — MIT licensed | [GitHub](https://github.com/GeoloeG-IsT/agents-reverse-engineer)
