# Cortex

The continuity protocol for Claude surfaces -- so the human never has to be the sync layer.

## The Problem

Claude Chat and Claude Code are powerful individually, but they share nothing. A strategic decision made in Chat at midnight is invisible to Code the next morning. The person becomes the messenger -- copying context, re-explaining decisions, re-establishing shared understanding every time they switch surfaces.

Cortex is the missing layer. It defines how context flows between Claude surfaces automatically, so that each surface knows what the others learned.

## Architecture

```
+-------------------+                     +-------------------+
|    Claude Chat    |                     |    Claude Code    |
|  (web / mobile)   |                     |    (terminal)     |
+--------+----------+                     +--------+----------+
         |                                         |
         | decisions, priorities,                   | artifacts, state,
         | insights                                 | blockers
         |                                         |
         v                                         v
+--------------------------------------------------------------+
|                       ~/.cortex/                              |
|                                                              |
|   contexts/              surfaces/           config.yaml     |
|     ctx_a1b2c3d4.md       chat.json                         |
|     ctx_e5f6g7h8.md       code.json                         |
+--------------------------------------------------------------+
         |                                         |
         | artifacts, state,                       | decisions, priorities,
         | blockers                                | insights
         |                                         |
         v                                         v
+-------------------+                     +-------------------+
|    Claude Chat    |                     |    Claude Code    |
|  (reads build     |                     |  (reads strategic |
|   state)          |                     |   context)        |
+-------------------+                     +-------------------+
```

Each surface **produces** context objects (decisions, artifacts, state) and **consumes** context objects from other surfaces. The store is local, file-based, and human-inspectable.

## Quick Start

```bash
# Install
npm install -g cortex-protocol

# See what's in the store
cortex status
cortex list

# Show a specific context object
cortex show ctx_a1b2c3d4

# Write a context object from the command line
cortex write -t decision --title "Use email OTP" --body "No passwords. Supabase signInWithOtp." -p my-app

# Start the HTTP server for Claude Chat integration
cortex serve
```

### As a Library

```typescript
import { ContextStore, startServer } from 'cortex-protocol';

// Store operations
const store = new ContextStore();
await store.init();

await store.write({
  id: store.generateId(),
  type: 'decision',
  source_surface: 'chat',
  timestamp: new Date().toISOString(),
  project: 'my-app',
  confidence: 'high',
  ttl: 'persistent',
  supersedes: null,
  tags: ['architecture'],
  title: 'Use email OTP for auth',
  body: 'Decided against passwords and magic links. Email OTP via Supabase.',
});

const decisions = await store.list({ type: 'decision', project: 'my-app' });
const forCode = await store.getForSurface('my-app', 'code');

// Start the HTTP MCP server programmatically
await startServer({ port: 3131, token: 'my-secret' });
```

## Integration

Cortex connects to Claude through two transport layers:

### Claude Code (stdio MCP)

The stdio MCP server runs as a local process that Claude Code talks to natively. It provides 6 tools:

| Tool | Description |
|------|-------------|
| `cortex_query` | Search context objects by type, project, surface, tags |
| `cortex_write` | Record decisions, priorities, insights, blockers |
| `cortex_status` | Show store summary (counts by type, project, surface) |
| `cortex_show` | View a specific context object |
| `cortex_delete` | Remove a context object |
| `cortex_inject` | Get cross-surface context shaped for the consuming surface |

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["/path/to/cortex/dist/mcp/server.js"]
    }
  }
}
```

### Claude Chat (HTTP MCP via Connectors)

The HTTP server exposes the same 6 tools over the MCP Streamable HTTP transport. Claude Chat connects to it as a Connector.

```bash
# Start the server
cortex serve                        # default: port 3131, no auth
cortex serve --port 8080            # custom port
cortex serve --token MY_SECRET      # bearer token auth

# Or via environment variables
CORTEX_PORT=8080 CORTEX_TOKEN=secret cortex serve
```

**Connecting Claude Chat:**

1. Start `cortex serve` on your machine
2. Expose it via a tunnel (e.g., ngrok, Cloudflare Tunnel, or Tailscale Funnel)
3. In claude.ai: Settings > Connectors > Add > paste your tunnel URL + `/mcp`
4. Claude Chat now has access to all Cortex tools

**Endpoints:**

| Path | Method | Description |
|------|--------|-------------|
| `/mcp` | POST | MCP protocol (initialize, tool calls) |
| `/mcp` | GET | SSE stream (with session ID) |
| `/mcp` | DELETE | Close session |
| `/health` | GET | Server status, store size, uptime |

### Hooks (Automatic Context Capture)

Cortex integrates with Claude Code through hooks that run automatically:

**On commit (PostToolUse hook):** Detects `git commit` commands, reads commit metadata, writes an `artifact` context object to the store.

```
Claude Code: git commit -m "feat: billing API v2"
  --> [cortex] Captured: artifact -- "feat: billing API v2" (ctx_f3e8a921)
```

**On session end:** Captures current branch, modified files, failing tests, and TODOs as `state` or `blocker` context objects. New snapshots supersede old ones.

**On session start (inject):** Reads the store, filters for the current project, and outputs a markdown summary for Claude Code.

```bash
cortex inject parallax > .claude/cortex/context.md
```

## CLI Commands

```
cortex status                   Show store summary (counts by type, project, surface)
cortex list                     List all context objects
cortex list -t decision         Filter by type
cortex list -p my-app           Filter by project
cortex list -s chat             Filter by source surface
cortex list --since 2026-03-01  Filter by date
cortex show <id>                View full context object
cortex write -t <type> ...      Create a new context object
cortex delete <id>              Remove a context object
cortex compact                  Remove expired objects
cortex export                   Dump the full store as JSON
cortex inject <project>         Output context summary (for hooks)
cortex serve                    Start HTTP MCP server for Claude Chat
```

## Context Object Format

Context objects are markdown files with YAML frontmatter. Human-readable, machine-parseable, `cat`-able.

```yaml
---
id: ctx_a1b2c3d4
type: decision            # decision | artifact | state | priority | blocker | insight
source_surface: chat      # chat | code | api | desktop
timestamp: 2026-03-15T02:30:00Z
project: parallax         # null = cross-project
confidence: high          # high | medium | low
ttl: persistent           # persistent | session | 24h | 7d
supersedes: null           # ctx_<id> of the object this replaces
tags: [architecture, auth]
---

# Use email OTP for auth

Decided against passwords and magic links. Email OTP via Supabase signInWithOtp().
Simpler UX, no password reset flow, no email deliverability issues with magic links.
```

### Context Types

| Type | What It Captures |
|------|-----------------|
| `decision` | A choice that affects future work |
| `artifact` | Something produced -- commits, docs, shipped features |
| `state` | Current status of work in progress |
| `priority` | What matters most right now |
| `blocker` | Something preventing progress |
| `insight` | A realization that changes understanding |

### Surface Contracts

Each surface has defined roles -- what it produces and what it consumes:

```
Chat produces:  decisions, priorities, insights, blockers
Chat consumes:  artifacts, state, blockers (from Code)

Code produces:  artifacts, state, blockers
Code consumes:  decisions, priorities, insights (from Chat)
```

The store handles this routing via `getForSurface()` -- it filters context objects so each surface sees only what's relevant to it.

## The Store

All context lives in `~/.cortex/` -- a local, file-based store. No database, no cloud dependency, no external services. Each context object is a markdown file you can read with `cat`.

```
~/.cortex/
  contexts/           # One .md file per context object
  surfaces/           # Per-surface sync state (JSON)
  config.yaml         # User preferences
```

The `ContextStore` class manages reads, writes, filtering, expiration, and indexing. It handles TTL-based expiration (24h, 7d, session, persistent) and conflict resolution via timestamps and the `supersedes` field.

## Project Status

- [x] Protocol spec (SPEC.md)
- [x] Context schema and TypeScript types
- [x] Store implementation (read, write, filter, compact, export)
- [x] CLI (status, list, show, write, delete, compact, export, inject, serve)
- [x] Claude Code hooks (commit extraction, session snapshot, context injection)
- [x] MCP server -- stdio (Claude Code native integration)
- [x] MCP server -- HTTP/StreamableHTTP (Claude Chat via Connectors)
- [ ] Protocol formalization and conformance tests
- [ ] npm publish

See [VISION.md](./VISION.md) for the full product thesis and [SPEC.md](./SPEC.md) for the protocol specification.

## Requirements

- Node.js >= 20
- TypeScript 5.7+

## Development

```bash
git clone https://github.com/eddiebelaval/cortex.git
cd cortex
npm install
npm run build
npm run dev     # Watch mode
npm test        # Run tests (vitest) -- 57 tests across 4 suites
npm run lint    # Type check
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

Apache 2.0. See [LICENSE](./LICENSE).

## Credits

Built by [Eddie Belaval](https://github.com/eddiebelaval) / [id8Labs](https://id8labs.app).

Born from the daily friction of using Claude Chat for strategy and Claude Code for building, and being the human sync layer between them. Rather than wait for the fix, built the fix.
