# Chat-to-Cortex Integration Research

> How do Chat-side decisions reach the Cortex store at `~/.cortex/`?

Date: 2026-03-15

---

## Problem Statement

Cortex captures Code-side context automatically via hooks (commits, session state, blockers). But the reverse direction -- Chat decisions reaching Code -- has no implementation. Without this, the store contains only Code artifacts. Code sessions start with no awareness of strategic decisions, priority shifts, or architectural choices made in Chat.

This document evaluates five approaches to closing that gap.

---

## Approach 1: Claude Chat Memory API

### What Exists Today

Claude Chat has a memory system that persists facts, preferences, and context across conversations. As of March 2026:

- **View memories:** Settings > Capabilities > "View and edit your memory"
- **Export memories:** Ask Claude "Write out your memories of me verbatim, exactly as they appear in your memory" -- it dumps all stored memories as text.
- **Import memories:** claude.com/import-memory provides a prompt to paste into other AI assistants that formats their memories for Claude ingestion.
- **Data export:** Settings > Privacy allows full account export (conversations + metadata), delivered as a download link via email within 24 hours.
- Memory import/export is available on free, Pro, and Max plans.

### What Does NOT Exist

- **No programmatic API for memory.** There is no REST endpoint to read, write, or query Claude's memory store. The Messages API (`api.anthropic.com/v1/messages`) handles conversation completions only -- it has no memory CRUD operations.
- **No structured export format.** Memory export is unstructured text (copy-paste from Chat), not JSON or YAML. There is no schema, no IDs, no timestamps on individual memories.
- **No webhook or event system.** No way to be notified when a new memory is created.
- **No write-back mechanism.** You cannot programmatically inject a memory into Claude Chat. Import is manual paste only.

### Assessment

| Criteria | Rating |
|----------|--------|
| Technical feasibility today | Not feasible. No API exists. |
| Friction level | N/A |
| Zero-effort continuity | No. Completely manual. |

### Verdict

**Dead end for now.** If Anthropic ships a Memory API (read/write/query endpoints), this becomes the best approach by far -- it would be native, low-friction, and bidirectional. Worth monitoring Anthropic's API changelog, but not buildable today.

---

## Approach 2: Browser Extension + Native Messaging Host

### Architecture

```
[claude.ai tab] --> [Content Script] --> [Background Worker] --> [Native Messaging Host] --> [~/.cortex/]
```

Three components:

1. **Content Script** -- injected into claude.ai pages, reads conversation DOM
2. **Background Service Worker** -- coordinates between content script and native host
3. **Native Messaging Host** -- a local process (Node.js) that writes to the filesystem

### Technical Findings

**Reading claude.ai conversations:**
- claude.ai is a React SPA. DOM elements mount/unmount on navigation.
- Message content lives in `contenteditable` divs, read via `el.innerText` (not `el.value`).
- A `MutationObserver` is required to detect new messages as the DOM changes. Direct element references go stale after React re-renders.
- Conversation boundaries can be detected by URL changes (`/chat/{id}`) or DOM mutations when a new conversation loads.

**Writing to the local filesystem:**
- Chrome extensions **cannot** write to the filesystem directly. This is a hard security boundary.
- **Native Messaging** is the official Chrome API for this. The extension communicates with a local host process via `runtime.connectNative()` or `runtime.sendNativeMessage()`.
- The native host is a standalone executable (Node.js script works) registered via a JSON manifest at a known path on macOS:
  - `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.cortex.bridge.json`
- Communication is over stdin/stdout with length-prefixed JSON messages.
- Chrome starts the host process on demand and keeps it alive while the port is open.

**Decision detection:**
- The extension could use heuristics to detect decisions: messages containing "let's go with," "the plan is," "priority is," "decision:," etc.
- Better: a UI overlay (small button or keyboard shortcut) that lets the user explicitly mark a message as a decision/priority/insight.
- Best (but harder): send the conversation to Claude API for extraction -- "identify decisions and priorities in this conversation."

### Implementation Complexity

| Component | Effort | Notes |
|-----------|--------|-------|
| Content script (DOM reader) | Medium | React SPA makes this fragile. DOM structure can change with any claude.ai deploy. |
| Background worker | Low | Standard Chrome extension boilerplate. |
| Native messaging host | Medium | Node.js process, stdin/stdout protocol, writes to `~/.cortex/`. |
| Host installer | Low | Shell script to register the manifest and install the Node.js host. |
| Decision detection (manual) | Low | Button or keyboard shortcut to mark messages. |
| Decision detection (auto) | High | Requires Claude API calls, prompt engineering, cost. |

### Risks

1. **Fragility.** claude.ai DOM changes will break the content script. Anthropic ships frequently. Maintenance burden is ongoing.
2. **Review process.** Chrome Web Store review for extensions using `nativeMessaging` permission is stricter.
3. **Installation friction.** User must install both the extension AND the native messaging host. Two-step setup.
4. **Security surface.** Native messaging hosts have full filesystem access. Must validate all messages from the extension.

### Assessment

| Criteria | Rating |
|----------|--------|
| Technical feasibility today | Feasible. All APIs exist and are documented. |
| Friction level | Medium-high. Two-component install, fragile DOM scraping. |
| Zero-effort continuity | Partial. After install, can be low-friction (button click or auto-detect). |

### Verdict

**Feasible but heavy.** This is the most complete solution -- it can capture context in real-time from Chat conversations. But the maintenance cost of DOM scraping against a React SPA is significant. Best suited as a Phase 2 investment after simpler approaches prove the value.

---

## Approach 3: Manual Bridge (CLI + macOS Shortcut)

### Architecture

```
[User copies text from Chat] --> [macOS Shortcut / CLI] --> [~/.cortex/contexts/]
```

Two variants:

**Variant A: CLI command**
```bash
cortex write --type decision --project homer --title "Use email OTP for auth" --body "Decided in Chat: no passwords, no magic links. Supabase signInWithOtp."
```

**Variant B: macOS Shortcut (Shortcuts.app or Automator)**
1. User selects text in Claude Chat, copies to clipboard (Cmd+C).
2. Triggers a keyboard shortcut (e.g., Ctrl+Shift+C).
3. macOS Shortcut runs:
   - Reads clipboard via `pbpaste`
   - Prompts for type (decision/priority/insight) and project via a dialog
   - Calls `cortex write` with the clipboard content as body
4. Context object appears in `~/.cortex/contexts/`.

**Variant C: Raycast/Alfred extension**
- Same as Variant B but triggered from Raycast/Alfred instead of Shortcuts.app.
- Better UX: type-ahead for project names, recent types, etc.

### Implementation

```bash
# The cortex CLI already exists in the spec. Just needs a `write` subcommand:
cortex write \
  --type decision \
  --source chat \
  --project homer \
  --confidence high \
  --title "Use email OTP for auth" \
  --body "No passwords. Supabase signInWithOtp + verifyOtp."
```

The macOS Shortcut is ~10 lines of shell:
```bash
#!/bin/bash
BODY=$(pbpaste)
TYPE=$(osascript -e 'choose from list {"decision", "priority", "insight", "blocker"} with title "Cortex" with prompt "Context type:"')
PROJECT=$(osascript -e 'text returned of (display dialog "Project (or blank for global):" default answer "")')
cortex write --type "$TYPE" --source chat --project "$PROJECT" --body "$BODY"
osascript -e 'display notification "Saved to Cortex" with title "Cortex"'
```

### Assessment

| Criteria | Rating |
|----------|--------|
| Technical feasibility today | Fully feasible. Can build in hours. |
| Friction level | Low-medium. Requires user action (copy + shortcut), but fast (~5 seconds). |
| Zero-effort continuity | No. User must remember to capture decisions. |

### Verdict

**Best starting point.** Lowest cost to build, lowest risk, immediately useful. The `cortex write` CLI command is needed regardless of which other approach ships. The macOS Shortcut adds a usable capture flow that requires minimal friction. Ship this first, measure usage, then decide if the browser extension is worth the investment.

---

## Approach 4: Claude Projects as Sync Point

### What Exists Today

Claude Projects are workspaces on claude.ai with:
- Dedicated chat history per project
- **Project knowledge:** upload files (PDF, DOCX, CSV, TXT, HTML, MD) up to 30MB each, unlimited files
- RAG mode when knowledge approaches context limits (up to 10x expansion)
- Sharing on Team/Enterprise plans

### Can Project Knowledge Be Updated Programmatically?

**No -- not today.** Project knowledge is managed entirely through the claude.ai web UI:
- Upload files manually via the project settings page
- No API endpoint exists for creating, updating, or managing projects or their knowledge files
- Anthropic has mentioned "enhanced API integration" for projects as a future feature, but no timeline

### Theoretical Sync Flow (If API Existed)

```
[Code hook writes to ~/.cortex/] --> [cortex sync] --> [Upload to Claude Project knowledge] --> [Chat reads it automatically]
```

This would be elegant: Code produces a `cortex-state.md` file summarizing recent commits, blockers, and state. A sync command uploads it to the Project's knowledge base. Next time the user opens that Project in Chat, Claude automatically has the build context.

The reverse direction (Chat --> Code) would work if the Project knowledge could be downloaded: the project accumulates decisions via conversations, and a sync command pulls them to `~/.cortex/`.

### Assessment

| Criteria | Rating |
|----------|--------|
| Technical feasibility today | Not feasible. No programmatic access to Projects. |
| Friction level | N/A (if API existed: very low) |
| Zero-effort continuity | N/A (if API existed: near-zero for Store-->Chat direction) |

### Verdict

**High potential, not buildable today.** If Anthropic ships a Projects API, this becomes the cleanest Chat integration path -- especially for Store-->Chat (Code context surfaced in Chat). Monitor the API changelog. The file-upload model maps perfectly to Cortex's markdown-based context objects.

**Workaround available now:** A user could manually drag-and-drop a `cortex-summary.md` file into their Claude Project's knowledge. The `cortex export --format md --project homer` command could generate this file. Not zero-effort, but functional.

---

## Approach 5: MCP in Claude Chat

### What Exists Today

This is the most promising finding in this research.

**Claude.ai (web) supports remote MCP servers as "Connectors."** This is not limited to Claude Desktop.

Key facts:
- **Available on:** Free (1 custom connector), Pro, Max, Team, Enterprise plans
- **Setup:** Settings > Connectors > "+" button > enter name + URL
- **Transport:** Remote MCP servers over HTTP (Streamable HTTP) or SSE. NOT stdio (that is Desktop/Code only).
- **Auth:** OAuth flow via `https://claude.ai/api/mcp/auth_callback`
- **Custom servers:** Fully supported. You can build and host your own remote MCP server.

### What This Means for Cortex

If Cortex runs a remote MCP server (even on localhost, tunneled via something like ngrok or Cloudflare Tunnel), Claude Chat on the web could:

1. **Read from the Cortex store** -- a `cortex_status` tool that returns recent Code artifacts, state, and blockers
2. **Write to the Cortex store** -- a `cortex_write` tool that creates decision/priority/insight context objects
3. **Query the store** -- a `cortex_list` tool filtered by project, type, or date

Claude Chat would have native access to Cortex tools, just like Code does via the MCP server.

### Architecture

```
[Claude Chat on claude.ai]
        |
        | (HTTPS / SSE)
        v
[Remote MCP Server (Cortex)]  <-- hosted locally or on a VPS
        |
        | (filesystem read/write)
        v
    [~/.cortex/]
```

### Technical Requirements

1. **Remote MCP server:** The existing Cortex MCP server (`src/mcp/`) currently uses stdio transport (for Claude Code). It needs an HTTP/SSE transport adapter to serve as a remote connector.
2. **Tunnel or hosting:** For claude.ai to reach a localhost server, you need either:
   - A tunnel: `ngrok`, `cloudflared tunnel`, or similar
   - A VPS: deploy the MCP server to a cloud instance with filesystem sync back to local
3. **OAuth (optional):** Claude.ai connectors support OAuth. For a personal-use local server, you could use a simple shared secret or skip auth if tunneled with access controls.
4. **HTTPS required:** claude.ai will not connect to plain HTTP endpoints. The tunnel provides this automatically.

### Challenges

1. **Always-on requirement.** The MCP server must be running whenever you want Chat to access Cortex. A launchd agent could handle this on macOS.
2. **Tunnel stability.** ngrok free tier rotates URLs. Cloudflare Tunnel with a custom domain is more stable.
3. **Latency.** localhost --> tunnel --> claude.ai --> tunnel --> localhost adds round-trip time, but for a text-based context store this is negligible.
4. **Security surface.** Exposing a localhost service to the internet (even via tunnel) requires care. Auth, rate limiting, and request validation are important.

### Implementation Path

1. Add HTTP/SSE transport to the existing Cortex MCP server (the `@modelcontextprotocol/sdk` likely supports this already).
2. Create a `cortex serve` CLI command that starts the remote MCP server.
3. Register a Cloudflare Tunnel or use ngrok to expose it.
4. Add the connector URL in Claude.ai Settings > Connectors.
5. Chat can now call `cortex_write`, `cortex_status`, `cortex_list` natively.

### Assessment

| Criteria | Rating |
|----------|--------|
| Technical feasibility today | Feasible. All pieces exist. Moderate implementation effort. |
| Friction level | Low after setup. One-time tunnel + connector config. Then Chat uses tools natively. |
| Zero-effort continuity | Close to zero-effort. Claude Chat can read/write Cortex without any user action beyond normal conversation. |

### Verdict

**This is the winning approach for bidirectional sync.** MCP in Chat means Claude itself can read and write context objects -- no DOM scraping, no clipboard, no browser extension. The user just talks to Claude in Chat, and Claude uses the Cortex tools to persist decisions and read Code state. This is the closest thing to "zero-effort continuity" that is buildable today.

---

## Recommendation: Phased Implementation

### Phase 1: CLI + macOS Shortcut (build now, ship this week)

- Add `cortex write` subcommand to the CLI
- Build a macOS Shortcut for clipboard-to-Cortex capture
- Lowest cost, immediately useful, proves the capture flow
- **Effort:** 1-2 days

### Phase 2: MCP Remote Server for Chat (build next, the real solution)

- Add HTTP/SSE transport to the Cortex MCP server
- Set up Cloudflare Tunnel with a stable domain
- Register as a Connector in Claude.ai
- Claude Chat gains native `cortex_write` and `cortex_status` tools
- **Effort:** 3-5 days
- **This is the primary investment.** It achieves near-zero-effort bidirectional continuity.

### Phase 3: Monitor Anthropic APIs (watch, don't build)

- **Memory API:** If Anthropic ships programmatic memory access, evaluate as a complement to MCP
- **Projects API:** If Anthropic ships project knowledge API, evaluate as a Store-->Chat delivery mechanism
- **Neither is buildable today.** Do not invest engineering time waiting for these.

### Not Recommended (for now)

- **Browser extension:** Too fragile (DOM scraping), too heavy (native messaging host), too much maintenance. Only reconsider if MCP Connectors are deprecated or prove insufficient.

---

## Sources

- [Import and export your memory from Claude](https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude)
- [Use Claude's chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)
- [How can I export my Claude data?](https://support.claude.com/en/articles/9450526-how-can-i-export-my-claude-data)
- [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Building custom connectors via remote MCP servers](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [Pre-built web connectors using remote MCP](https://support.claude.com/en/articles/11176164-pre-built-web-connectors-using-remote-mcp)
- [Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [Connect to remote MCP servers](https://modelcontextprotocol.io/docs/develop/connect-remote-servers)
- [MCP Apps blog post](http://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [Chrome Native Messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [What are Claude Projects?](https://support.claude.com/en/articles/9517075-what-are-projects)
- [Claude Code + Chrome integration](https://code.claude.com/docs/en/chrome)
- [Anthropic memory import tool announcement (MacRumors)](https://www.macrumors.com/2026/03/02/anthropic-memory-import-tool/)
- [Claude connectors expand tool connections (Help Net Security)](https://www.helpnetsecurity.com/2026/01/27/anthropic-claude-mcp-integration/)
