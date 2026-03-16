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
|     ctx_e5f6g7h8.md       code.json          index.json     |
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

# Initialize the store
cortex status

# See what's in the store
cortex list

# Show a specific context object
cortex show ctx_a1b2c3d4
```

### As a library

```typescript
import { ContextStore } from 'cortex-protocol';

const store = new ContextStore();
await store.init();

// Write a context object
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

// Read context for a project
const decisions = await store.list({
  type: 'decision',
  project: 'my-app',
});

// Get context shaped for a specific surface
const forCode = await store.getForSurface('my-app', 'code');
// Returns: decisions, priorities, insights from Chat
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
cortex delete <id>              Remove a context object
cortex compact                  Remove expired objects
cortex export                   Dump the full store as JSON
cortex inject <project>         Output context summary for a project (for hooks)
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

## How It Works

### The Store

All context lives in `~/.cortex/` -- a local, file-based store. No database, no cloud dependency, no external services. Each context object is a markdown file you can read with `cat`.

```
~/.cortex/
  contexts/           # One .md file per context object
  surfaces/           # Per-surface sync state (JSON)
  index.json          # Fast lookup index
  config.yaml         # User preferences
```

The `ContextStore` class manages reads, writes, filtering, expiration, and indexing. It handles TTL-based expiration (24h, 7d, session, persistent) and conflict resolution via timestamps and the `supersedes` field.

### Hooks

Cortex integrates with Claude Code through hooks that run automatically:

**On commit (PostToolUse hook):** The `extract-commit` hook detects `git commit` commands, reads commit metadata via git, and writes an `artifact` context object to the store. Zero effort from the user.

```
Claude Code: git commit -m "feat: billing API v2"
  --> [cortex] Captured: artifact -- "feat: billing API v2" (ctx_f3e8a921)
```

**On session end:** The `session-snapshot` hook captures the current branch, modified files, failing tests, and TODOs as a `state` or `blocker` context object. New snapshots supersede old ones.

**On session start (inject):** The `inject-context` script reads the store, filters for the current project, and outputs a markdown summary that Claude Code reads as project context.

```bash
# Generate context file for Claude Code to read
cortex inject parallax > .claude/cortex/context.md
```

### Surface Contracts

Each surface has defined roles -- what it produces and what it consumes:

```
Chat produces:  decisions, priorities, insights, blockers
Chat consumes:  artifacts, state, blockers (from Code)

Code produces:  artifacts, state, blockers
Code consumes:  decisions, priorities, insights (from Chat)
```

The store handles this routing via `getForSurface()` -- it filters context objects so each surface sees only what's relevant to it.

## Project Status

Cortex is in early development. Phase 1 (Code-side) is the current focus.

- [x] Protocol spec (SPEC.md)
- [x] Context schema and TypeScript types
- [x] Store implementation (read, write, filter, compact, export)
- [x] CLI (status, list, show, delete, compact, export, inject)
- [x] Claude Code hooks (commit extraction, session snapshot, context injection)
- [ ] MCP server (query context from within Claude Code natively)
- [ ] Chat-side integration (browser extension or Memory API)
- [ ] Protocol formalization and conformance tests

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
npm test        # Run tests (vitest)
npm run lint    # Type check
```

## Contributing

Cortex is open source under Apache 2.0. Contributions welcome.

If you're hitting the same continuity wall between Claude surfaces, open an issue or PR. The protocol is designed to be extended -- new surface types, new context types, new transport mechanisms.

Before submitting:
1. `npm run build` passes
2. `npm run lint` passes
3. Tests pass (`npm test`)

## License

Apache 2.0. See [LICENSE](./LICENSE).

## Credits

Built by [Eddie Belaval](https://github.com/eddiebelaval) / [id8Labs](https://id8labs.app).

Born from the daily friction of using Claude Chat for strategy and Claude Code for building, and being the human sync layer between them. Rather than wait for the fix, built the fix.
