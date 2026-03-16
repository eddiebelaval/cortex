# <PROJECT_NAME> — Project Instructions

## Overview

<!-- One-line description of the project. -->

## Structure

<!-- Key directories and what lives in them. -->

```
src/
  ...
```

## Commands

- `npm run build` — compile / bundle
- `npm run dev` — local development server
- `npm test` — run tests
- `npm run lint` — lint + type-check

## Stack

<!-- List primary technologies. -->

- TypeScript
- Next.js / React
- Supabase
- Tailwind CSS

## Key Patterns

<!-- Project-specific conventions: naming, file layout, error handling, etc. -->

- **TypeScript strict mode** — no `any`, no implicit types.
- **No emojis** in code or UI. Use icon libraries instead.

---

## Cortex — Cross-Surface Context

This project uses Cortex for continuity between Claude surfaces (Chat, Code, API).

### Session Start
At the beginning of every session, call `cortex_inject` with the project name to load
decisions, priorities, and insights from other surfaces:

    cortex_inject({ project: "<PROJECT_NAME>" })

Apply any returned context — especially decisions and priorities — before starting work.

### During the Session
When you make a significant decision, encounter a blocker, or produce a key artifact,
record it with `cortex_write`:

    cortex_write({
      type: "decision",       // decision | artifact | state | priority | blocker | insight
      title: "Short title",
      body: "Why this matters and what it means for future work.",
      project: "<PROJECT_NAME>",
      confidence: "high",     // high | medium | low
      ttl: "persistent"       // persistent | session | 24h | 7d
    })

**What to record:**
- `decision` — Architectural choices, tech stack changes, pattern selections
- `blocker` — Failing tests, unresolved dependencies, waiting on external (use ttl: "24h" or "7d")
- `insight` — Realizations that change how the project should be built
- `artifact` — Major shipped features, schema changes, new modules
- `priority` — Shifts in what matters most right now
- `state` — Build progress updates at session end (use ttl: "session")

**What NOT to record:** Typo fixes, routine commits, obvious choices.

### Breakpoints
At natural breakpoints (before a commit, end of a feature, session wrap-up), check what
is in the store:

    cortex_status()

### Superseding Old Context
When a new decision replaces an old one, link them:

    cortex_write({
      type: "decision",
      title: "Switch from REST to tRPC",
      body: "REST was adding too much boilerplate. tRPC gives end-to-end type safety.",
      project: "<PROJECT_NAME>",
      supersedes: "ctx_a1b2c3d4"
    })

---

## Git Workflow

- Never commit directly to `main`. Use feature branches and PRs.
- Run `npm run build && npm run lint` before committing.
- Commit messages follow conventional format: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`.

## License

<!-- MIT / Apache 2.0 / proprietary -->
