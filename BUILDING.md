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

### Phase 3 -- Protocol Formalization (v0.3.0)

Protocol Formalization is the biggest gap between the vision and the shipped product. The reference implementation already enforces protocol semantics through code (Zod schemas, store logic, MCP tool schemas), but none of this is extracted into a standalone specification that someone could implement against.

**What needs to happen:**

1. **Write PROTOCOL.md** -- Extract the implicit protocol from the codebase into a standalone spec using RFC 2119 language (MUST/SHOULD/MAY). Covers: context object format, frontmatter validation rules, surface contracts, transport requirements, conflict resolution algorithm, TTL/compaction behavior, security requirements.

2. **Add protocol version field** -- Add `protocol: cortex/1.0` to context object frontmatter. Update Zod schemas, store read/write, and MCP tools to include the version. Define backward compatibility rules.

3. **Build conformance test suite** -- Tests that verify protocol compliance independent of the reference implementation. Round-trip serialization, frontmatter validation, tool contract verification, conflict resolution, TTL expiration.

4. **Version negotiation** -- Define how surfaces with different protocol versions interact.

**Prerequisite:** Live testing with Claude Chat via Connector (in progress) should complete first. Real-world usage data may reveal protocol gaps that should be addressed before formalizing.

### Other Next Steps

- [ ] npm publish (v0.2.0)
- [ ] Anthropic outreach -- position Cortex as the continuity case study

---

## Heal Session: 2026-03-20

**Blocker addressed:** Protocol Formalization (Pillar 5) was UNREALIZED with no documentation of what it entails or what's needed to realize it.

**What changed:**
- **SPEC.md:** Added "Protocol Formalization (Phase 3)" section documenting: what implicit protocol semantics already exist in the codebase, what Phase 3 will produce (spec document, conformance tests, version scheme), and current status. Added protocol version to Current Boundaries.
- **BUILDING.md:** Expanded Phase 3 from a single bullet into a scoped roadmap with 4 concrete work items and a prerequisite.
- **No code changes.** Protocol Formalization requires design work before implementation. This heal documents the gap clearly so the next session can start building.

**Why documentation, not code:** The protocol spec itself needs to be designed (RFC 2119 language, what's normative vs. informational, version scheme). Writing code before the spec exists would produce conformance tests with nothing to conform to. The right first step is scoping the work, which this heal does.

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
