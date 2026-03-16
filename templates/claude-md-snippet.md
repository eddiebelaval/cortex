# Cortex Integration (copy this block into any project's CLAUDE.md)

```markdown
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
```

---

## Usage

1. Replace `<PROJECT_NAME>` with your project identifier (lowercase, e.g., "homer", "parallax").
2. Paste the block above (inside the markdown fence) into your project's `.claude/CLAUDE.md`.
3. Ensure the Cortex MCP server is registered in your Claude Code config:
   ```json
   {
     "mcpServers": {
       "cortex": {
         "command": "node",
         "args": ["<path-to-cortex>/dist/mcp/server.js"]
       }
     }
   }
   ```
