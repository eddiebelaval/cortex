# Contributing to Cortex

Cortex is open source under Apache 2.0. Contributions are welcome.

## Getting Started

```bash
git clone https://github.com/eddiebelaval/cortex.git
cd cortex
npm install
npm run build
npm test
```

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all checks pass:
   ```bash
   npm run build        # TypeScript compilation
   npm run lint         # Type checking (tsc --noEmit)
   npm test             # Vitest test suite
   ```
4. Open a pull request against `main`

## Project Structure

```
src/
  types/      # Context object schema, surface contracts
  store/      # Read/write/index context objects in ~/.cortex/
  hooks/      # Claude Code hooks (PostToolUse, session end)
  cli/        # CLI commands (status, list, show, write, delete, serve, etc.)
  mcp/        # MCP servers (stdio for Code, HTTP for Chat)
  utils/      # Shared formatting, git helpers
  index.ts    # Public API exports
tests/
  store.test.ts         # Unit tests for ContextStore
  hooks.test.ts         # Unit tests for hook logic
  e2e.test.ts           # End-to-end tests (CLI + store + hooks)
  http-server.test.ts   # HTTP MCP server E2E tests
```

## Key Patterns

- **ESM modules** -- `"type": "module"` in package.json. Use `.js` extensions in imports.
- **TypeScript strict mode** -- no `any`, no implicit types.
- **Context objects** are markdown files with YAML frontmatter, parsed with `gray-matter`.
- **Security** -- use `execFileSync` not `exec` for shell commands. Validate IDs before filesystem access.

## What to Contribute

- **New surface types** -- Desktop, mobile, API agents. Each needs a surface contract (what it produces/consumes).
- **Transport mechanisms** -- WebSocket, gRPC, cloud sync.
- **Protocol extensions** -- New context types, conflict resolution strategies.
- **Bug fixes and tests** -- Always welcome.

## Style

- No emojis in code or output
- Concise commit messages
- Tests for new functionality
