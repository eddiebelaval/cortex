# BUILDING.md — Cortex

> What's been done, what's in progress, what's next.

Last updated: 2026-03-15

---

## Current Phase: Phase 1 Complete

The Code-side reference implementation is built, tested, and live.

---

## Completed

- [x] Identified core problem: no continuity layer between Claude surfaces
- [x] Named the project: Cortex (brain's outer layer — integrates signals from different regions into unified awareness)
- [x] VISION.md — product thesis and framing complete
- [x] SPEC.md — context schema, surface contracts, transport layer, privacy model
- [x] BUILDING.md — initialized
- [x] Early prototype (id8-sync bash script) — validated the pain point, informed the vision
- [x] GitHub repo: eddiebelaval/cortex (public, Apache 2.0)
- [x] Context object TypeScript types (6 types, 4 surfaces, YAML frontmatter schema)
- [x] Store manager (read/write/list/filter/delete/compact/export with parallel loadIndex)
- [x] Claude Code hook — PostToolUse captures git commits as context objects
- [x] Claude Code hook — SessionEnd captures branch state and active files
- [x] Session start injector (inject-context.ts — outputs cross-surface markdown)
- [x] CLI commands: cortex status, list, show, delete, compact, export, inject
- [x] MCP server with 6 tools: cortex_query, cortex_write, cortex_status, cortex_show, cortex_delete, cortex_inject
- [x] MCP server wired into ~/.claude.json — available in all Claude Code sessions
- [x] Hooks wired into ~/.claude/settings.json (PostToolUse + SessionEnd)
- [x] README.md — architecture diagram, quick start, CLI reference
- [x] CLAUDE.md — project-aware Claude Code sessions
- [x] Test suite: 48 tests (22 unit + 26 E2E), all passing
- [x] Security hardening: path traversal protection, ID validation, source_surface param
- [x] Code quality: shared utils (formatAge, summarizeContexts, git helpers), no duplication
- [x] Data round-trip bug fixed: structured_data now persists correctly in frontmatter

---

## In Progress

- [ ] Live testing with Parallax and Homer as real projects (store is capturing — need usage data)

---

## Next

- [ ] Phase 2 — Chat-side integration (browser extension or Memory API)
- [ ] Phase 3 — Protocol formalization and conformance tests
- [ ] Open-source community setup (CONTRIBUTING.md, issue templates)
- [ ] Anthropic outreach — position Cortex as the continuity case study

---

## Open Questions

1. What's the right integration point for Chat — browser extension, Memory API, or Claude Projects?
2. Should context objects be Git-tracked by default (history) or ephemeral (current state only)?
3. How should the MCP server handle store changes from external writes (file watcher vs reload on query)?

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

---

_This file is the source of truth for what's happening right now._
