# BUILDING.md — Cortex

> What's been done, what's in progress, what's next.

---

## Current Phase: Foundation

Defining the protocol and building the first implementation.

---

## Completed

- [x] Identified core problem: no continuity layer between Claude surfaces
- [x] Named the project: Cortex (brain's outer layer — integrates signals from different regions into unified awareness)
- [x] VISION.md — product thesis and framing complete
- [x] SPEC.md — context schema, surface contracts, transport layer, privacy model
- [x] BUILDING.md — initialized
- [x] Early prototype (id8-sync bash script) — validated the pain point, informed the vision
- [x] GitHub repo: eddiebelaval/cortex (public, Apache 2.0)

---

## In Progress

- [ ] Reference implementation — Phase 1 (Code-side)
  - [ ] Context object TypeScript types
  - [ ] Store manager (read/write/index context objects)
  - [ ] Claude Code hook (PostToolUse — extract context on commit)
  - [ ] Session start injector (read store, inject into project context)
  - [ ] CLI commands (cortex status, list, show, delete)

---

## Next

- [ ] MCP server wrapping the store (so Claude Code can query context natively)
- [ ] Test with Parallax and Homer as live projects
- [ ] Phase 2 — Chat-side browser extension or Memory API integration
- [ ] Phase 3 — Protocol formalization and conformance tests
- [ ] Open-source community setup (CONTRIBUTING.md, issue templates)
- [ ] Anthropic outreach — position Cortex as the continuity case study

---

## Open Questions

1. Should the MCP server be the primary interface, or should the CLI + hooks be sufficient for Phase 1?
2. How large can the context store grow before it needs compaction/garbage collection?
3. What's the right integration point for Chat — browser extension, Memory API, or Claude Projects?
4. Should context objects be Git-tracked by default (history) or ephemeral (current state only)?

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

---

_This file is the source of truth for what's happening right now._
