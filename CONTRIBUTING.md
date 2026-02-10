# Contributing to agents-reverse-engineer

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/GeoloeG-IsT/agents-reverse-engineer.git
cd agents-reverse-engineer
npm install
npm run build
```

### Running in Development

```bash
npm run dev
```

Uses `tsx watch` for live reload during development.

### Building

```bash
npm run build
```

Compiles TypeScript to `dist/` via `tsc`.

## Project Structure

```
src/
  cli/          # CLI entry point and command handlers
  config/       # Configuration schema and loading
  discovery/    # File discovery and plan generation
  generation/   # Documentation generation (AI-driven)
  orchestration/# Concurrency pool, tracing, process management
  ai/           # AI service abstraction and subprocess management
```

## Making Changes

1. **Fork** the repo and create a branch from `main`
2. Make your changes
3. Ensure `npm run build` succeeds
4. Submit a pull request

## Reporting Bugs

Open an issue at [GitHub Issues](https://github.com/GeoloeG-IsT/agents-reverse-engineer/issues) with:

- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Node version, AI runtime)

## Feature Requests

Open an issue with the `enhancement` label describing your use case and proposed solution.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
