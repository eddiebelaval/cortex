---
last-reconciled: 2026-03-20
status: CURRENT
Build stage: Stage 8
Drift status: CURRENT
vision-alignment: 80%
---

# SPEC

## Identity

Cortex is a continuity protocol for Claude surfaces. It defines how context flows between Chat (web/mobile), Code (terminal), and future surfaces (API agents, desktop, extensions). The protocol is file-based, human-readable, and works with today's Claude infrastructure. The core abstraction: every Claude surface both **produces** and **consumes** context objects. Cortex defines the schema for those objects, the contracts for each surface, and the transport layer that moves them.

## Current Capabilities

### 1. Context Schema

A context object is a structured record of something Claude learned or produced on one surface that would be valuable on another.

- **6 context types:** decision, artifact, state, priority, blocker, insight
- **4 source surfaces:** chat, code, api, desktop
- **YAML frontmatter fields:** id (`ctx_<uuid-first-8>`), type, source_surface, timestamp (ISO-8601), project (string or null), confidence (high/medium/low), ttl (persistent/session/24h/7d), supersedes (ctx_id or null), tags (string array)
- **Body format:** markdown with optional structured data section for machine-parseable key-value pairs
- **ID format:** `ctx_` + UUIDv4 first 8 chars (e.g., `ctx_a1b2c3d4`)
- **Confidence rules:** casual mention in Chat = low, explicit decision = high, commit = high
- **TTL defaults:** decisions are persistent, blockers are 24h/7d, state is session (refreshed each session)
- **Supersedes linking:** when a new decision replaces an old one, the link prevents stale context from overriding current context
- **Project scoping:** maps to a project directory or identifier; null = cross-project/personal

| Type | What It Captures | Example |
|------|-----------------|---------|
| `decision` | A choice made that affects future work | "Use email OTP for auth, not passwords" |
| `artifact` | Something produced: code, docs, designs | "Shipped v2 of the billing API" |
| `state` | Current status of work in progress | "Auth module 80% done, blocked on Stripe webhook" |
| `priority` | What matters most right now | "Revenue before new features this week" |
| `blocker` | Something preventing progress | "Can't deploy until DNS propagates" |
| `insight` | A realization that changes understanding | "Users abandon onboarding at step 3, not step 5" |

### 2. Surface Contracts

Each Claude surface has a defined contract for what it produces and consumes.

- **Chat (Web/Mobile) produces:** decision, priority, insight, blocker. **Consumes:** artifact, state, blocker from Code.
- **Code (Terminal) produces:** artifact, state, blocker. **Consumes:** decision, priority, insight from Chat.
- **API/Agents (Future) produces:** artifact, state. **Consumes:** priority, decision.
- **How Chat consumes:** context objects injected into system prompt or memory as structured summaries. Chat sees a "build state" section that updates after each Code session.
- **How Code consumes:** context objects written to `.claude/cortex/` as markdown files, read as part of project context (similar to how CLAUDE.md works today).

### 3. Transport Layer (File-Based Store)

- **Store location:** `~/.cortex/` with contexts/, surfaces/, and config.yaml
- **Store manager:** read, write, list, filter, delete, compact, export operations with parallel loadIndex
- **Index removed:** loadIndex scans .md files directly (eliminated dead write on every mutation)
- **File format:** markdown with YAML frontmatter, parsed with gray-matter
- **Why file-based:** works offline, human-inspectable, git-trackable, no external dependencies, matches `.claude/` pattern

### 4. Sync Mechanism

- **Code to Store:** PostToolUse hook extracts context objects on commit, SessionEnd captures branch state. Runs automatically with zero human effort.
- **Store to Code:** At session start, reads `~/.cortex/contexts/` for objects relevant to the current project. Injected via `.claude/cortex/` directory.
- **Chat to Store:** Claude Chat integration captures decisions and priorities from conversations and writes to the store.
- **Store to Chat:** Chat reads from the store at conversation start. Context objects formatted as structured summary in system prompt or via Memory.

| Trigger | Direction | Mechanism |
|---------|-----------|-----------|
| Code session start | Store to Code | Read `~/.cortex/contexts/`, filter by project |
| Code commit | Code to Store | PostToolUse hook extracts artifacts + state |
| Code session end | Code to Store | Summarize session, write state objects |
| Chat conversation start | Store to Chat | Read store, format as context summary |
| Chat explicit save | Chat to Store | User says "remember this" or "save this decision" |
| Chat conversation end | Chat to Store | Extract decisions and priorities automatically |

### 5. Conflict Resolution

- **Newer wins by default.** Timestamps determine recency.
- **`supersedes` breaks ties.** If a context explicitly replaces another, the replacement wins.
- **Human arbitration on demand.** The user can view conflicts via `cortex status` and resolve manually.
- **Confidence weights.** A high confidence context from Code (a commit) outweighs a low confidence context from Chat (a passing mention).

### 6. Claude Code Hooks

- **PostToolUse hook:** captures git commits as context objects (artifact type, high confidence)
- **SessionEnd hook:** captures branch state and active files (state type)
- **Hooks wired into:** `~/.claude/settings.json`, run automatically with zero human effort

### 7. MCP Server (stdio, for Claude Code)

- **6 tools:** cortex_query, cortex_write, cortex_status, cortex_show, cortex_delete, cortex_inject
- **Wired into:** `~/.claude.json`, available in all Claude Code sessions
- **source_surface as MCP param:** supports cross-surface filtering (not hardcoded to 'code')
- **Binary:** `cortex-mcp`

### 8. HTTP MCP Server (StreamableHTTP, for Claude Chat)

- **Same 6 tools** exposed over StreamableHTTP transport
- **Claude Chat connects** as a Connector via `cortex serve`
- **Bearer auth:** token-based authentication for remote access
- **CORS:** configured for cross-origin requests from Chat
- **Session management:** tracks active Chat sessions
- **File watcher:** detects external writes to the store (e.g., Code hook writes while Chat is connected)
- **Binary:** `cortex-serve`

### 9. CLI

- **Commands:** status, list, show, delete, compact, export, inject
- **Built with:** Commander.js
- **Binary:** `cortex` (via package.json bin field)

```bash
cortex status                  # What's in the store, what's pending sync
cortex list                    # All context objects, filterable by type/project
cortex show ctx_a1b2c3d4       # View a specific context object
cortex delete ctx_a1b2c3d4     # Remove a context object
cortex compact                 # Remove expired context objects
cortex export                  # Export store as JSON (for backup or migration)
cortex inject                  # Output project-scoped context as markdown
```

### 10. Privacy and Control

- **Nothing syncs without the user knowing.** `cortex status` shows exactly what's in the store.
- **Project-level scoping.** Users restrict sync to specific projects. Personal conversations stay personal.
- **Opt-out per context.** Any context object can be deleted. The user owns their context.
- **No cloud by default.** Everything is local. Cloud sync is opt-in for multi-device setups.

### 11. Test Suite

- **48 tests total:** 22 unit + 26 E2E, all passing
- **Framework:** Vitest
- **Command:** `npm test` (vitest run)

### 12. Security

- **Path traversal protection:** ID validation before filesystem access
- **MCP param validation:** source_surface accepted as parameter, not assumed
- **Session TTL:** 8 hours (prevents session contexts from accumulating indefinitely)
- **Shell safety:** `execFileSync` used instead of `exec` for shell commands
- **Bearer auth:** HTTP MCP server requires token for access
- **Data round-trip integrity:** structured_data persists correctly in frontmatter

## Architecture Contract

### Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Language | TypeScript (strict) | ESM modules, `.js` extensions in imports |
| Runtime | Node.js >= 20 | |
| Build | tsc | Watch mode via `tsc --watch` |
| Test | Vitest | 48 tests (22 unit + 26 E2E) |
| CLI | Commander.js | Binary: `cortex` |
| MCP (stdio) | @modelcontextprotocol/sdk | Binary: `cortex-mcp` |
| MCP (HTTP) | @modelcontextprotocol/sdk | Binary: `cortex-serve`, StreamableHTTP |
| Parsing | gray-matter | YAML frontmatter extraction |
| Validation | Zod | Schema validation |

### System Role

Cortex is the continuity layer between Claude surfaces. It sits below the surfaces (Chat, Code, API, Desktop) and above the filesystem, providing structured context transport so no surface operates in isolation.

### Primary Actors

- `Human` -- the person using Claude across surfaces, who should never have to be the sync layer
- `Claude Code` -- produces artifact/state/blocker context via hooks, consumes decision/priority/insight via MCP inject
- `Claude Chat` -- produces decision/priority/insight via HTTP MCP server, consumes artifact/state/blocker
- `Claude API/Agents` -- (future) produces artifact/state, consumes priority/decision
- `CLI user` -- inspects, manages, and exports context via `cortex` commands

### Data Flow

```
Claude Code session
  -> PostToolUse hook (on commit)
  -> context object (artifact type)
  -> ~/.cortex/contexts/ctx_<id>.md

Claude Code session
  -> SessionEnd hook
  -> context object (state type)
  -> ~/.cortex/contexts/ctx_<id>.md

Claude Chat session
  -> HTTP MCP server (cortex serve)
  -> cortex_write tool call
  -> context object (decision/priority/insight type)
  -> ~/.cortex/contexts/ctx_<id>.md

Session start (any surface)
  -> cortex_inject / inject CLI
  -> read ~/.cortex/contexts/
  -> filter by project + TTL
  -> formatted markdown summary
  -> injected into surface context

Human
  -> cortex CLI (status/list/show/delete/compact/export)
  -> ~/.cortex/ store
```

### Core Entities

| Entity | Purpose | Key Fields |
|--------|---------|------------|
| Context Object | Structured record of cross-surface knowledge | id, type, source_surface, timestamp, project, confidence, ttl, supersedes, tags, body |
| Store | File-based persistence layer | contexts/ directory, config.yaml |
| Surface Contract | Defines what each surface produces/consumes | surface type, produces list, consumes list |
| Config | User preferences and project mappings | project directory mappings, sync preferences |

### Integrations

| Service | Purpose | Status |
|---------|---------|--------|
| Claude Code hooks | Automatic context capture on commit and session end | Live |
| MCP server (stdio) | Mid-session context query and write from Claude Code | Live |
| MCP server (HTTP) | StreamableHTTP transport for Claude Chat Connectors | Live |
| Anthropic Memory API | Potential deeper integration for Chat context | Planned (Phase 3) |

## Protocol Formalization (Phase 3 -- NOT YET IMPLEMENTED)

Phase 3 will extract the implicit protocol semantics already present in the reference implementation into a standalone, implementable specification. The goal: any Claude surface or third-party tool can implement Cortex compatibility without reading this codebase.

### What Exists Today (Implicit Protocol)

The reference implementation already enforces these protocol semantics through code:

- **Context object schema:** 6 types, 4 surfaces, 9 frontmatter fields, markdown body. Validated by Zod schemas in `src/types/context.ts`.
- **Surface contracts:** defined produce/consume relationships per surface (Chat produces decisions, Code produces artifacts, etc.). Documented in SPEC but enforced only by convention.
- **Transport contracts:** stdio MCP (6 tools with defined input/output schemas in `src/mcp/schemas.ts`) and HTTP MCP (StreamableHTTP with bearer auth). Tool schemas are the closest thing to a formal API contract.
- **Conflict resolution rules:** newer-wins, supersedes linking, confidence weighting. Implemented in store logic but not specified as normative requirements.
- **TTL semantics:** persistent, session, 24h, 7d. Compaction logic in `src/hooks/compact.ts`.

### What Phase 3 Will Produce

1. **Protocol Specification Document** -- a standalone document (likely `PROTOCOL.md` or similar) that defines:
   - Context object format (MUST/SHOULD/MAY requirements, following RFC 2119)
   - Required frontmatter fields and validation rules
   - Surface contract definitions (what each surface type MUST produce/consume)
   - Transport requirements (what a conformant transport MUST support)
   - Conflict resolution algorithm (normative, not just descriptive)
   - TTL and compaction behavior
   - Security requirements (path traversal protection, auth for HTTP transport)

2. **Conformance Test Suite** -- tests that any implementation can run to verify protocol compliance:
   - Context object serialization/deserialization round-trip tests
   - Frontmatter validation tests (required fields, valid values, ID format)
   - Transport tool contract tests (expected inputs/outputs for each of the 6 tools)
   - Conflict resolution tests (supersedes, timestamp ordering, confidence weighting)
   - TTL expiration tests

3. **Version Scheme** -- protocol versioning independent of implementation versioning:
   - Protocol version in context object frontmatter (e.g., `protocol: cortex/1.0`)
   - Backward compatibility rules
   - Version negotiation between surfaces

### Current Status

- **Protocol semantics:** embedded in code, not extracted as a spec
- **Conformance tests:** do not exist (existing tests verify the reference implementation, not protocol compliance)
- **Protocol versioning:** not implemented
- **Third-party implementability:** possible by reading source, but no spec to build against

## Current Boundaries

- Does NOT sync to cloud (local-first only)
- Does NOT store conversation transcripts (structured context objects only)
- Does NOT have conformance tests for third-party implementations (Phase 3)
- Does NOT have a published protocol spec (Phase 3)
- Does NOT have a protocol version field in context objects (Phase 3)
- Does NOT have a browser extension (HTTP MCP serves this role instead)

## Verification Surface

### Core Functionality
- [ ] Context objects written to `~/.cortex/contexts/` with correct YAML frontmatter
- [ ] Store manager reads, lists, filters, deletes, compacts, and exports context objects
- [ ] PostToolUse hook captures git commits as artifact-type context objects
- [ ] SessionEnd hook captures branch state as state-type context objects
- [ ] `cortex inject` outputs filtered, project-scoped context as markdown

### MCP Server (stdio)
- [ ] All 6 MCP tools (query, write, status, show, delete, inject) respond correctly
- [ ] source_surface parameter accepted and used for filtering
- [ ] MCP server available in all Claude Code sessions via ~/.claude.json

### HTTP MCP Server (StreamableHTTP)
- [ ] `cortex serve` starts HTTP server with StreamableHTTP transport
- [ ] Bearer auth validates tokens on incoming requests
- [ ] CORS headers configured for Chat origin
- [ ] File watcher detects external store changes
- [ ] Claude Chat connects as a Connector and can call all 6 tools

### CLI
- [ ] All 7 CLI commands (status, list, show, delete, compact, export, inject) work correctly
- [ ] `cortex status` shows store contents and pending sync state

### Infrastructure
- [ ] `npm run build` succeeds
- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` passes all 48 tests (22 unit + 26 E2E)

## Drift Log

| Date | Section | What Changed | Why | VISION Impact |
|------|---------|-------------|-----|---------------|
| 2026-03-15 | All | Initial spec written alongside implementation | Phase 1 reference implementation built in a single session | Pillars 1-3 marked REALIZED in VISION |
| 2026-03-20 | Capabilities 8, Integrations, Data Flow, Verification | HTTP MCP server added for Chat-side integration | Phase 2 shipped: StreamableHTTP transport, bearer auth, CORS, file watcher | Pillar 4 marked REALIZED in VISION |
| 2026-03-20 | All | Upgraded to v2 format | Triad v2 template adoption | Added frontmatter, System Role, Primary Actors, Data Flow, Core Entities, Current Boundaries, Verification Surface |
| 2026-03-20 | Protocol Formalization, Current Boundaries | Documented Phase 3 scope and current state | Heal session: Protocol Formalization was UNREALIZED with no spec-level documentation of what it entails | Pillar 5 remains UNREALIZED; gap now clearly scoped |

---

_This spec describes the system as it exists today. It evolves as we build._
