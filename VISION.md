# VISION.md — Cortex

> The missing continuity layer between Claude surfaces.

---

## Soul

Cortex is the continuity protocol that makes Claude feel like one mind instead of several strangers who happen to share a name. Context, decisions, and awareness flow between surfaces so the person never has to be the sync layer.

## Pillars

1. **Context Schema & Types** -- REALIZED
   Context objects with 6 types (decision, artifact, state, priority, blocker, insight), YAML frontmatter, confidence levels, TTL, and supersedes linking. TypeScript types shipped.

2. **Code-Side Transport** -- REALIZED
   PostToolUse hook captures commits, SessionEnd captures branch state. MCP server with 6 tools (query, write, status, show, delete, inject). Wired into all Claude Code sessions.

3. **CLI & Store Management** -- REALIZED
   File-based store at ~/.cortex/. CLI commands: status, list, show, delete, compact, export, inject. 48 tests (22 unit + 26 E2E), all passing.

4. **Chat-Side Integration** -- UNREALIZED
   Browser extension or Anthropic Memory API integration to capture decisions from Chat conversations and surface Code-produced context in Chat.

5. **Protocol Formalization** -- UNREALIZED
   Publish Cortex as a formal protocol spec with conformance tests that any Claude surface or third-party tool can implement.

---

## The World As It Is

Claude is becoming the operating system for knowledge work. Millions of people think with Claude every day — in Chat on the web, on mobile, in Claude Code at the terminal. Each surface is powerful on its own. Together, they should be extraordinary.

They're not. Not yet.

Every time a person moves between surfaces, they hit a wall. Claude Chat doesn't know what Claude Code just built. Claude Code doesn't know what Claude Chat just decided. The person becomes the messenger — copying, pasting, re-explaining, re-establishing context that should already be there. The most valuable artifact in any Claude interaction — the *shared understanding* between human and AI — evaporates the moment you switch tabs.

This isn't a bug. It's a missing layer.

## The Insight

Claude already has the pieces. Memory persists preferences and facts across Chat conversations. CLAUDE.md gives Code persistent project instructions. The `.claude/` directory holds workspace configuration. These are all expressions of the same need: **Claude should know what Claude knows.**

But they're isolated systems. Memory doesn't reach Code. CLAUDE.md doesn't reach Chat. A decision made at 2AM in a mobile conversation disappears by the time you open your terminal in the morning. The human carries context that the system should carry for them.

The mental model people have — that they're working with *one Claude* — is correct in spirit but broken in practice. Continuity is the promise. Fragmentation is the reality.

## The World We're Building Toward

Imagine opening Claude Code on a Monday morning. Without a word, it knows:

- The architectural decision you made Sunday night in Chat on your phone
- That the project priority shifted based on a conversation you had over the weekend
- What you told Chat you were frustrated about, and what that implies for today's work
- The strategic context that shapes *why* you're building, not just *what*

Now imagine opening Claude Chat after a deep coding session. Without explanation, it knows:

- What you just shipped — the commits, the structure changes, the new patterns
- Where you got stuck and what's still unresolved
- How the codebase has evolved since last time you talked strategy
- What the code reveals about where the project actually is vs. where you said it would be

This isn't science fiction. Every piece of this is technically achievable with current infrastructure. What's missing is the protocol — the shared language and transport layer that lets Claude's awareness flow between surfaces like a single continuous consciousness.

## What Cortex Is

Cortex is a **continuity protocol** for Claude. It defines how context, decisions, and awareness flow between Claude surfaces so that the person never has to be the sync layer.

It is:

- **A specification** — how context should be structured, versioned, and transported between surfaces
- **A reference implementation** — working code that proves the spec, buildable today with existing tools
- **A product thesis** — the argument that continuity is the single highest-leverage improvement Anthropic can make to the Claude ecosystem

Cortex is not a hack, a workaround, or a bash script. It's the infrastructure that makes Claude feel like one mind instead of several strangers who happen to share a name.

## Core Principles

**1. Zero-effort continuity.**
If the human has to remember to sync, the system has failed. Continuity must be automatic, ambient, and invisible. The best sync is the one you never think about.

**2. Bidirectional awareness.**
Context flows in both directions. Chat knows what Code did. Code knows what Chat decided. Neither surface is primary — they're equal participants in a shared understanding.

**3. Human-out-of-the-loop by default, human-in-the-loop by choice.**
The system should never require the person to act as a messenger between Claude instances. But the person should always be able to see, edit, and override what's being shared.

**4. Respect the surface.**
Chat and Code serve different purposes. Continuity doesn't mean making them identical — it means each surface has the *context it needs* to serve its purpose well. Code needs decisions and priorities. Chat needs build state and progress. The protocol shapes context to fit the surface.

**5. Open and extensible.**
The protocol should work for any Claude surface — current and future. Desktop, mobile, terminal, API, agents. If Anthropic builds a new surface tomorrow, Cortex should be ready for it.

## Why This Matters Now

Anthropic is in a race to make Claude indispensable. The threat isn't that another model will be smarter — it's that another ecosystem will be more *coherent*. The developer who uses Claude Chat for strategy and Claude Code for building should feel like they have a thought partner with perfect memory, not two strangers in a trench coat.

Every day this gap exists, people build habits around it — they learn to re-explain, to copy-paste, to keep their own notes. Those habits are scar tissue. They make Claude feel like a tool instead of a partner. And once those habits calcify, they're hard to undo.

The continuity layer is the difference between "I use Claude" and "I think with Claude."

## Who Built This and Why

Cortex was built by Eddie Belaval — a 20-year television producer turned AI product builder, operating as ID8Labs out of Miami. Eddie uses Claude Chat and Claude Code as his primary thinking and building environment across multiple products (Parallax, Homer, ID8-Toolkit). He hit the continuity wall daily: strategic conversations in Chat that Code couldn't see, coding sessions that Chat couldn't reference, decisions that evaporated between surfaces.

Rather than wait for a fix, he built the fix. Not as a workaround — as a product thesis. The belief: the best way to show Anthropic what their platform needs is to build it, use it, and open-source it so every builder hitting this wall can benefit.

This is what it looks like when your power users become your product team.

---

*"The goal isn't to build a bridge between two products. It's to dissolve the boundary so completely that the question 'which Claude am I talking to?' stops making sense."*
