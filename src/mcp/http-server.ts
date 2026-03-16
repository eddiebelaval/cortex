#!/usr/bin/env node

/**
 * Cortex Remote MCP Server (HTTP/SSE)
 *
 * Exposes the same Cortex tools as the stdio server, but over HTTP
 * using the MCP Streamable HTTP transport. This allows Claude Chat
 * (claude.ai) to connect as a Connector and read/write context.
 *
 * Usage:
 *   cortex serve [--port 3131] [--token SECRET]
 *
 * Then add as a Connector in Claude.ai:
 *   Settings > Connectors > + > URL: https://your-tunnel/mcp
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ContextStore } from '../store/index.js';
import { formatAge, summarizeContexts, formatStoreSummary, formatContextSummary } from '../utils/index.js';
import { querySchema, writeSchema, idSchema, injectSchema } from './schemas.js';
import type { Surface } from '../types/index.js';

const PORT = parseInt(process.env.CORTEX_PORT ?? '3131', 10);
const AUTH_TOKEN = process.env.CORTEX_TOKEN ?? '';

const store = new ContextStore();
let storeDirty = false;

function createMcpServer(): Server {
  const server = new Server(
    { name: 'cortex', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'cortex_query',
        description: 'Search the Cortex context store by type, project, surface, tags.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            project: { type: 'string', description: 'Filter by project name' },
            type: { type: 'string', enum: ['decision', 'artifact', 'state', 'priority', 'blocker', 'insight'] },
            surface: { type: 'string', enum: ['chat', 'code', 'api', 'desktop'] },
            since: { type: 'string', description: 'ISO date filter' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      {
        name: 'cortex_write',
        description: 'Write a context object to the store. Record decisions, priorities, insights, or blockers.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            type: { type: 'string', enum: ['decision', 'artifact', 'state', 'priority', 'blocker', 'insight'] },
            title: { type: 'string', description: 'Short title' },
            body: { type: 'string', description: 'Detailed description' },
            project: { type: 'string', description: 'Project name (null for global)' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            ttl: { type: 'string', enum: ['persistent', 'session', '24h', '7d'] },
            tags: { type: 'array', items: { type: 'string' } },
            supersedes: { type: 'string', description: 'ID of context to replace' },
            source_surface: { type: 'string', enum: ['chat', 'code', 'api', 'desktop'] },
          },
          required: ['type', 'title', 'body'],
        },
      },
      {
        name: 'cortex_status',
        description: 'Show store summary — total objects by type, project, surface.',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'cortex_show',
        description: 'View a specific context object by ID.',
        inputSchema: {
          type: 'object' as const,
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      {
        name: 'cortex_delete',
        description: 'Remove a context object from the store.',
        inputSchema: {
          type: 'object' as const,
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      {
        name: 'cortex_inject',
        description: 'Get cross-surface context for a project. Returns what the consuming surface needs.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            project: { type: 'string' },
            surface: { type: 'string', enum: ['chat', 'code', 'api', 'desktop'] },
          },
          required: ['project'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (storeDirty) {
      await store.init();
      storeDirty = false;
    }

    const { name, arguments: args } = request.params;
    const raw = args ?? {};

    try {
      switch (name) {
        case 'cortex_query': {
          const params = querySchema.parse(raw);
          const contexts = await store.list({
            type: params.type,
            project: params.project,
            surface: params.surface,
            since: params.since,
            tags: params.tags,
            excludeExpired: true,
          });

          if (contexts.length === 0) {
            return { content: [{ type: 'text', text: 'No context objects found.' }] };
          }

          const lines = contexts.map((ctx) => {
            const age = formatAge(ctx.timestamp);
            return `**${ctx.title}** (${ctx.id})\n  Type: ${ctx.type} | Surface: ${ctx.source_surface} | Project: ${ctx.project ?? '(global)'} | ${age} ago\n  ${ctx.body.split('\n')[0]}`;
          });

          return { content: [{ type: 'text', text: `${contexts.length} context(s):\n\n${lines.join('\n\n')}` }] };
        }

        case 'cortex_write': {
          const params = writeSchema.parse(raw);
          const context = {
            id: store.generateId(),
            type: params.type,
            source_surface: params.source_surface as Surface,
            timestamp: new Date().toISOString(),
            project: params.project ?? null,
            confidence: params.confidence,
            ttl: params.ttl,
            supersedes: params.supersedes ?? null,
            tags: params.tags,
            title: params.title,
            body: params.body,
          };

          const id = await store.write(context);
          return { content: [{ type: 'text', text: `Written: ${id} (${context.type}: "${context.title}")` }] };
        }

        case 'cortex_status': {
          const all = await store.export();
          return { content: [{ type: 'text', text: formatStoreSummary(summarizeContexts(all)) }] };
        }

        case 'cortex_show': {
          const params = idSchema.parse(raw);
          const ctx = await store.read(params.id);
          if (!ctx) return { content: [{ type: 'text', text: `Not found: ${params.id}` }] };

          const text = `--- ${ctx.id} ---\nType: ${ctx.type}\nSurface: ${ctx.source_surface}\nProject: ${ctx.project ?? '(global)'}\nConfidence: ${ctx.confidence}\nTTL: ${ctx.ttl}\nCreated: ${ctx.timestamp}\n\n# ${ctx.title}\n\n${ctx.body}`;
          return { content: [{ type: 'text', text }] };
        }

        case 'cortex_delete': {
          const params = idSchema.parse(raw);
          const ok = await store.delete(params.id);
          return { content: [{ type: 'text', text: ok ? `Deleted ${params.id}` : `Not found: ${params.id}` }] };
        }

        case 'cortex_inject': {
          const params = injectSchema.parse(raw);
          const contexts = await store.getForSurface(params.project, params.surface);

          if (contexts.length === 0) {
            return { content: [{ type: 'text', text: `No cross-surface context for ${params.project}.` }] };
          }

          let text = `# Cortex Context for ${params.project}\n\n`;
          text += `${contexts.length} context(s) from other surfaces.\n\n`;
          text += formatContextSummary(contexts);
          return { content: [{ type: 'text', text }] };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Validation error: ${message}` }] };
    }
  });

  return server;
}

async function main() {
  await store.init();

  // Watch for external writes
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    watch(store.watchPath, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { storeDirty = true; }, 500);
    });
  } catch { /* watch not available */ }

  // Track active transports per session
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    // CORS for claude.ai
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Auth check
    if (AUTH_TOKEN) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${AUTH_TOKEN}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    // Health check
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', store: store.size, uptime: process.uptime() }));
      return;
    }

    // MCP endpoint
    if (req.url === '/mcp') {
      // Check for existing session
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      if (req.method === 'POST' && !sessionId) {
        // New session — create transport + server
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);

        // Track the session after handleRequest (session ID is set during handling)
        const sid = transport.sessionId;
        if (sid) {
          transports.set(sid, transport);
          transport.onclose = () => {
            transports.delete(sid);
          };
        }
        return;
      }

      // Session not found
      if (sessionId && !transports.has(sessionId)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use /mcp for MCP protocol or /health for status.' }));
  });

  httpServer.listen(PORT, () => {
    console.log(`[cortex] Remote MCP server running on http://localhost:${PORT}/mcp`);
    console.log(`[cortex] Health check: http://localhost:${PORT}/health`);
    if (AUTH_TOKEN) {
      console.log(`[cortex] Auth: Bearer token required`);
    } else {
      console.log(`[cortex] Auth: NONE (set CORTEX_TOKEN for bearer auth)`);
    }
    console.log(`[cortex] Store: ${store.size} context objects`);
    console.log(`[cortex] Add as Claude.ai Connector: Settings > Connectors > + > URL`);
  });
}

main().catch((err) => {
  console.error('[cortex] Fatal:', err);
  process.exit(1);
});
