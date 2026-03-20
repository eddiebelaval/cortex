---
last-evolved: 2026-03-20
confidence: HIGH
distance: 20%
pillars: "5 (4R, 0P, 1U)"
---

# VISION

## Soul

Cortex is the continuity protocol that makes Claude feel like one mind instead of several strangers who happen to share a name. Context, decisions, and awareness flow between surfaces so the person never has to be the sync layer.

## Why This Exists

Claude is becoming the operating system for knowledge work. Millions of people think with Claude every day: in Chat on the web, on mobile, in Claude Code at the terminal. Each surface is powerful on its own. Together, they should be extraordinary.

They're not. Not yet.

Every time a person moves between surfaces, they hit a wall. Claude Chat doesn't know what Claude Code just built. Claude Code doesn't know what Claude Chat just decided. The person becomes the messenger: copying, pasting, re-explaining, re-establishing context that should already be there. The most valuable artifact in any Claude interaction, the *shared understanding* between human and AI, evaporates the moment you switch tabs.

This isn't a bug. It's a missing layer.

Claude already has the pieces. Memory persists preferences and facts across Chat conversations. CLAUDE.md gives Code persistent project instructions. The `.claude/` directory holds workspace configuration. These are all expressions of the same need: **Claude should know what Claude knows.** But they're isolated systems. Memory doesn't reach Code. CLAUDE.md doesn't reach Chat. A decision made at 2AM in a mobile conversation disappears by the time you open your terminal in the morning. The human carries context that the system should carry for them.

The mental model people have, that they're working with *one Claude*, is correct in spirit but broken in practice. Continuity is the promise. Fragmentation is the reality.

Cortex was built by Eddie Belaval, a 20-year television producer turned AI product builder, operating as id8Labs out of Miami. He uses Claude Chat and Claude Code as his primary thinking and building environment across multiple products (Parallax, Homer, id8Labs suite). He hit the continuity wall daily: strategic conversations in Chat that Code couldn't see, coding sessions that Chat couldn't reference, decisions that evaporated between surfaces. Rather than wait for a fix, he built the fix. Not as a workaround, but as a product thesis. The belief: the best way to show Anthropic what their platform needs is to build it, use it, and open-source it so every builder hitting this wall can benefit.

This is what it looks like when your power users become your product team.

## Pillars

### 1. **Context Schema and Types** -- REALIZED

Context objects with 6 types (decision, artifact, state, priority, blocker, insight), YAML frontmatter, confidence levels, TTL, and supersedes linking. TypeScript types shipped.

### 2. **Code-Side Transport** -- REALIZED

PostToolUse hook captures commits, SessionEnd captures branch state. MCP server with 6 tools (query, write, status, show, delete, inject). Wired into all Claude Code sessions.

### 3. **CLI and Store Management** -- REALIZED

File-based store at ~/.cortex/. CLI commands: status, list, show, delete, compact, export, inject. 48 tests (22 unit + 26 E2E), all passing.

### 4. **Chat-Side Integration** -- REALIZED

HTTP MCP server exposes the same 6 Cortex tools over StreamableHTTP transport. Claude Chat connects as a Connector via `cortex serve`. Bearer auth, CORS, session management, file watcher for external writes.

### 5. **Protocol Formalization** -- UNREALIZED

Publish Cortex as a formal protocol spec with conformance tests that any Claude surface or third-party tool can implement.

## User Truth

**Who:** Builders who think with Claude across multiple surfaces: Chat for strategy, Code for building, mobile for quick decisions. They treat Claude as a thought partner, not a search engine.

**Before:** "I just spent 10 minutes re-explaining to Claude Code what I decided in Chat last night. Again. I'm the sync layer between my own tools."

**After:** "I opened Code this morning and it already knew the architectural decision I made in Chat on my phone last night. It just picked up where I left off."

## Phased Vision

### Phase 1 -- Code-Side Reference Implementation (COMPLETE)

Prove the concept works by building the producer/consumer loop for Claude Code. Hooks capture context automatically on commit and session end. MCP server makes context queryable mid-session. CLI gives the human full visibility and control. This phase validates the schema, store design, and zero-effort principle before investing in cross-surface transport.

### Phase 2 -- Chat-Side Integration (COMPLETE)

Bridge the second surface. HTTP MCP server over StreamableHTTP transport exposes the same 6 Cortex tools to Claude Chat via Connectors. Bearer auth, CORS, session management, and file watcher for external writes. Cortex is now truly bidirectional.

### Phase 3 -- Protocol Formalization (CURRENT)

Publish Cortex as a formal protocol spec with conformance tests. Any Claude surface, current or future (Desktop, API agents, extensions), can implement the protocol. Cortex becomes a community standard for Claude continuity, not just a personal tool.

## Edges

- Cortex does NOT replace Claude's built-in Memory (it complements it with cross-surface transport)
- Cortex does NOT store conversation transcripts (it captures structured context objects, not raw chat)
- Cortex does NOT require cloud infrastructure (local-first, file-based)
- Cortex does NOT try to be a general-purpose sync protocol (it is purpose-built for Claude surfaces)

## Anti-Vision

- Never require the human to manually sync context between surfaces. If the human has to remember to sync, the system has failed.
- Never make surfaces identical. Chat and Code serve different purposes. Continuity means each surface has the context it needs, not that they become the same thing.
- Never become a configuration burden. Cortex should work with zero config out of the box.
- Never lock context into a proprietary format. Context objects are markdown with YAML frontmatter: human-readable, human-editable, version-controllable.

## Design Principles

- **Zero-effort continuity.** If the human has to remember to sync, the system has failed. Continuity must be automatic, ambient, and invisible. The best sync is the one you never think about.
- **Bidirectional awareness.** Context flows in both directions. Chat knows what Code did. Code knows what Chat decided. Neither surface is primary: they're equal participants in a shared understanding.
- **Human-out-of-the-loop by default, human-in-the-loop by choice.** The system should never require the person to act as a messenger between Claude instances. But the person should always be able to see, edit, and override what's being shared.
- **Respect the surface.** Chat and Code serve different purposes. Continuity doesn't mean making them identical. It means each surface has the *context it needs* to serve its purpose well. Code needs decisions and priorities. Chat needs build state and progress. The protocol shapes context to fit the surface.
- **Open and extensible.** The protocol should work for any Claude surface, current and future. Desktop, mobile, terminal, API, agents. If Anthropic builds a new surface tomorrow, Cortex should be ready for it.

## Evolution Log

| Date | What Shifted | Signal | Section |
|------|-------------|--------|---------|
| 2026-03-15 | Initial vision established | Eddie hitting the continuity wall daily across Chat/Code surfaces | Soul, Pillars, all sections |
| 2026-03-15 | Phase 1 completed | Code-side hooks, MCP server, CLI, and 48 tests all shipped and passing | Pillars 1-3 marked REALIZED |
| 2026-03-20 | Phase 2 completed | HTTP MCP server over StreamableHTTP ships Chat-side integration | Pillar 4 marked REALIZED |
| 2026-03-20 | Upgraded to v2 format | Triad v2 template adoption | Added frontmatter, Why This Exists, Phased Vision, Design Principles, User Truth, Edges, Anti-Vision |

---

*"The goal isn't to build a bridge between two products. It's to dissolve the boundary so completely that the question 'which Claude am I talking to?' stops making sense."*
