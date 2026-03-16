# Cortex — Project Instructions

Cortex is a continuity protocol for Claude surfaces. It defines how context flows between Chat, Code, API, and Desktop so the human never has to be the sync layer.

## Structure

```
src/
  types/      # Context object schema, surface contracts
  store/      # Read/write/index context objects in ~/.cortex/
  hooks/      # Claude Code hooks (PostToolUse, session start)
  cli/        # cortex status, list, show, delete, sync, export
  mcp/        # MCP server wrapping the store
  index.ts    # Public API
```

## Commands

- `npm run build` — compile TypeScript (`tsc`)
- `npm run lint` — type-check only (`tsc --noEmit`)
- `npm test` — run tests (`vitest`)
- `npm run dev` — watch mode (`tsc --watch`)

## Key Patterns

- **ESM modules** — `"type": "module"` in package.json. Use `.js` extensions in all imports (even for .ts files).
- **TypeScript strict mode** — no `any`, no implicit types.
- **Context objects** are markdown files with YAML frontmatter, parsed with `gray-matter`.
- **Store location:** `~/.cortex/` — contexts/, index.json, surfaces/, config.yaml.
- **Context types:** decision, artifact, state, priority, blocker, insight.
- **Surfaces:** chat, code, api, desktop.
- **Security:** use `execFileSync` not `exec` for shell commands.
- **No emojis** in code or output.

## Context Object Format

```yaml
---
id: ctx_<uuid-first-8>
type: decision | artifact | state | priority | blocker | insight
source_surface: chat | code | api | desktop
timestamp: ISO-8601
project: string | null
confidence: high | medium | low
ttl: persistent | session | 24h | 7d
supersedes: ctx_<uuid> | null
tags: string[]
---
# Title
Body content here.
```

## License

Apache 2.0
