# BUILDING.md -- Cortex

> What's been done, what's in progress, what's next.

Last updated: 2026-03-20

---

## Current Phase: Phase 2 Complete (v0.2.0)

Code-side and Chat-side reference implementations are built, tested, and live.

---

## Completed

### Phase 1: Code-Side Transport (v0.1.0)

- [x] Identified core problem: no continuity layer between Claude surfaces
- [x] Named the project: Cortex (brain's outer layer that integrates signals from different regions into unified awareness)
- [x] VISION.md -- product thesis and framing complete
- [x] SPEC.md -- context schema, surface contracts, transport layer, privacy model
- [x] BUILDING.md -- initialized
- [x] Early prototype (id8-sync bash script) -- validated the pain point, informed the vision
- [x] GitHub repo: eddiebelaval/cortex (public, Apache 2.0)
- [x] Context object TypeScript types (6 types, 4 surfaces, YAML frontmatter schema)
- [x] Store manager (read/write/list/filter/delete/compact/export with parallel loadIndex)
- [x] Claude Code hook -- PostToolUse captures git commits as context objects
- [x] Claude Code hook -- SessionEnd captures branch state and active files
- [x] Session start injector (inject-context.ts -- outputs cross-surface markdown)
- [x] CLI commands: cortex status, list, show, delete, compact, export, inject, write
- [x] MCP server (stdio) with 6 tools: cortex_query, cortex_write, cortex_status, cortex_show, cortex_delete, cortex_inject
- [x] MCP server wired into ~/.claude.json -- available in all Claude Code sessions
- [x] Hooks wired into ~/.claude/settings.json (PostToolUse + SessionEnd)
- [x] README.md -- architecture diagram, quick start, CLI reference
- [x] CLAUDE.md -- project-aware Claude Code sessions
- [x] Security hardening: path traversal protection, ID validation, source_surface param
- [x] Code quality: shared utils (formatAge, summarizeContexts, git helpers), no duplication
- [x] Data round-trip bug fixed: structured_data now persists correctly in frontmatter

### Phase 2: Chat-Side Transport (v0.2.0)

Built an HTTP MCP server that exposes the same 6 Cortex tools over the Streamable HTTP transport, so Claude Chat (claude.ai) can connect as a Connector and read/write context objects.

- [x] HTTP MCP server (StreamableHTTP transport) -- same tool surface as stdio server
- [x] Session management -- each connection gets an isolated MCP session with its own transport
- [x] CORS headers -- allows claude.ai to connect cross-origin
- [x] Bearer token auth -- optional, via --token flag or CORTEX_TOKEN env var
- [x] Health endpoint -- /health returns store size and uptime
- [x] File watcher -- detects external writes to the store, reloads on next query
- [x] `cortex serve` CLI command -- starts the HTTP server from the main CLI
- [x] Standalone binary -- `cortex-serve` for direct execution
- [x] Exported `startServer()` function -- available as library API
- [x] Test suite: 57 tests (22 unit + 26 E2E + 9 HTTP server E2E), all passing
- [x] Version bump to 0.2.0
- [x] README updated with Phase 2 docs (serve command, Chat setup, tunnel guide)
- [x] CONTRIBUTING.md -- contribution guidelines and development setup

---

## In Progress

- [ ] Live testing with Claude Chat via Connector (server built, needs real-world usage data)

---

## Next

- [ ] Phase 3 -- Protocol formalization and conformance tests
- [ ] npm publish (v0.2.0)
- [ ] Anthropic outreach -- position Cortex as the continuity case study

---

## Open Questions

1. Should context objects be Git-tracked by default (history) or ephemeral (current state only)?
2. How should the MCP server handle concurrent writes from multiple surfaces?
3. What's the right protocol version format for conformance tests?

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-15 | Named "Cortex" | The brain's outer layer that integrates signals from different regions into unified awareness |
| 2026-03-15 | Product-first, not hack-first | Building this the way Anthropic would, not as a personal workaround |
| 2026-03-15 | Open-source from day one | Conversation starter + portfolio piece for Anthropic |
| 2026-03-15 | Apache 2.0 license | Permissive, enterprise-friendly, matches consciousness-framework |
| 2026-03-15 | File-based local store | Offline-first, human-inspectable, no dependencies, matches .claude/ pattern |
| 2026-03-15 | Markdown + YAML frontmatter for context objects | Human-readable AND machine-parseable. Same pattern as CLAUDE.md memory files |
| 2026-03-15 | TypeScript for reference implementation | Matches Claude Code ecosystem, npm-distributable |
| 2026-03-15 | MCP server as primary integration | Native tool calls > file reading. Claude queries context mid-session, not just at startup |
| 2026-03-15 | Removed index.json (written but never read) | loadIndex scans .md files directly. Eliminated dead write on every mutation |
| 2026-03-15 | Session TTL = 8 hours | Session contexts were never expiring. 8h matches a long working session |
| 2026-03-15 | Path traversal protection via ID validation | MCP tool args are externally controlled. Validate before filesystem access |
| 2026-03-15 | source_surface as MCP param | Hardcoding 'code' broke cross-surface filtering for Chat/API callers |
| 2026-03-20 | HTTP server for Chat-side | StreamableHTTP over stdio -- claude.ai Connectors need HTTP, not stdin/stdout |
| 2026-03-20 | Refactored startServer as exported function | CLI `serve` command and standalone binary share the same code path |
| 2026-03-20 | Version 0.2.0 | Phase 2 complete -- both Code-side and Chat-side transports working |

---

_This file is the source of truth for what's happening right now._
