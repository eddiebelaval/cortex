import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextStore } from '../src/store/context-store.js';

/**
 * E2E tests for the Cortex HTTP MCP server.
 *
 * These tests spin up a real HTTP server with the StreamableHTTP transport,
 * send MCP protocol messages, and verify responses end-to-end.
 */

// We need to import and set up the transport/server directly
// rather than spawning the http-server.ts process, since we need
// a temp store path.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

let httpServer: HttpServer;
let store: ContextStore;
let tempDir: string;
let port: number;
let baseUrl: string;

function createTestMcpServer(testStore: ContextStore): Server {
  const server = new Server(
    { name: 'cortex-test', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'cortex_status',
        description: 'Show store summary',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'cortex_write',
        description: 'Write a context object',
        inputSchema: {
          type: 'object' as const,
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            project: { type: 'string' },
          },
          required: ['type', 'title', 'body'],
        },
      },
      {
        name: 'cortex_query',
        description: 'Query contexts',
        inputSchema: {
          type: 'object' as const,
          properties: {
            project: { type: 'string' },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = (args ?? {}) as Record<string, unknown>;

    switch (name) {
      case 'cortex_status': {
        const all = await testStore.export();
        return { content: [{ type: 'text', text: `Store: ${all.length} objects` }] };
      }
      case 'cortex_write': {
        const ctx = {
          id: testStore.generateId(),
          type: params.type as 'decision',
          source_surface: 'chat' as const,
          timestamp: new Date().toISOString(),
          project: (params.project as string) ?? null,
          confidence: 'high' as const,
          ttl: 'persistent' as const,
          supersedes: null,
          tags: [],
          title: params.title as string,
          body: params.body as string,
        };
        const id = await testStore.write(ctx);
        return { content: [{ type: 'text', text: `Written: ${id}` }] };
      }
      case 'cortex_query': {
        const contexts = await testStore.list({
          project: params.project as string | undefined,
          excludeExpired: true,
        });
        return {
          content: [{
            type: 'text',
            text: contexts.length === 0
              ? 'No contexts'
              : contexts.map((c) => `${c.id}: ${c.title}`).join('\n'),
          }],
        };
      }
      default:
        return { content: [{ type: 'text', text: `Unknown: ${name}` }] };
    }
  });

  return server;
}

async function mcpRequest(
  method: string,
  params: Record<string, unknown>,
  id: number,
  sessionId?: string,
): Promise<{ headers: Headers; body: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const payload: Record<string, unknown> = { jsonrpc: '2.0', method };
  if (id > 0) payload.id = id;
  if (Object.keys(params).length > 0) payload.params = params;

  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  return { headers: response.headers, body };
}

function parseSSEData(body: string): unknown {
  const dataLine = body.split('\n').find((l) => l.startsWith('data: '));
  if (!dataLine) return null;
  return JSON.parse(dataLine.slice(6));
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cortex-http-test-'));
  store = new ContextStore({ storePath: tempDir });
  await store.init();

  const transports = new Map<string, StreamableHTTPServerTransport>();

  httpServer = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', store: store.size }));
      return;
    }

    if (req.url === '/mcp') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && transports.has(sessionId)) {
        await transports.get(sessionId)!.handleRequest(req, res);
        return;
      }

      if (req.method === 'POST' && !sessionId) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });
        const mcpServer = createTestMcpServer(store);
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);

        const sid = transport.sessionId;
        if (sid) {
          transports.set(sid, transport);
          transport.onclose = () => transports.delete(sid);
        }
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  httpServer?.close();
  await rm(tempDir, { recursive: true, force: true });
});

describe('HTTP MCP Server E2E', () => {
  it('health endpoint returns status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(typeof data.store).toBe('number');
  });

  it('MCP initialize returns server info and session ID', async () => {
    const { headers, body } = await mcpRequest(
      'initialize',
      {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
      1,
    );

    const sessionId = headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    expect(sessionId!.length).toBeGreaterThan(10);

    const data = parseSSEData(body) as { result: { serverInfo: { name: string } } };
    expect(data.result.serverInfo.name).toBe('cortex-test');
  });

  it('tools/list returns all tools after initialize', async () => {
    // Initialize to get session
    const init = await mcpRequest(
      'initialize',
      { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      1,
    );
    const sessionId = init.headers.get('mcp-session-id')!;

    // List tools
    const { body } = await mcpRequest('tools/list', {}, 2, sessionId);
    const data = parseSSEData(body) as { result: { tools: { name: string }[] } };

    const toolNames = data.result.tools.map((t) => t.name);
    expect(toolNames).toContain('cortex_status');
    expect(toolNames).toContain('cortex_write');
    expect(toolNames).toContain('cortex_query');
  });

  it('cortex_status returns store count', async () => {
    const init = await mcpRequest(
      'initialize',
      { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      1,
    );
    const sessionId = init.headers.get('mcp-session-id')!;

    const { body } = await mcpRequest(
      'tools/call',
      { name: 'cortex_status', arguments: {} },
      2,
      sessionId,
    );
    const data = parseSSEData(body) as { result: { content: { text: string }[] } };
    expect(data.result.content[0].text).toContain('Store:');
    expect(data.result.content[0].text).toContain('objects');
  });

  it('cortex_write creates a context object accessible via cortex_query', async () => {
    const init = await mcpRequest(
      'initialize',
      { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      1,
    );
    const sessionId = init.headers.get('mcp-session-id')!;

    // Write
    const writeRes = await mcpRequest(
      'tools/call',
      { name: 'cortex_write', arguments: { type: 'decision', title: 'HTTP test decision', body: 'Made via HTTP MCP', project: 'http-test' } },
      2,
      sessionId,
    );
    const writeData = parseSSEData(writeRes.body) as { result: { content: { text: string }[] } };
    expect(writeData.result.content[0].text).toContain('Written: ctx_');

    // Query
    const queryRes = await mcpRequest(
      'tools/call',
      { name: 'cortex_query', arguments: { project: 'http-test' } },
      3,
      sessionId,
    );
    const queryData = parseSSEData(queryRes.body) as { result: { content: { text: string }[] } };
    expect(queryData.result.content[0].text).toContain('HTTP test decision');
  });

  it('sessions are independent — different session IDs get different transports', async () => {
    const init1 = await mcpRequest(
      'initialize',
      { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test1', version: '1.0' } },
      1,
    );
    const init2 = await mcpRequest(
      'initialize',
      { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test2', version: '1.0' } },
      1,
    );

    const sid1 = init1.headers.get('mcp-session-id');
    const sid2 = init2.headers.get('mcp-session-id');

    expect(sid1).toBeTruthy();
    expect(sid2).toBeTruthy();
    expect(sid1).not.toBe(sid2);
  });

  it('returns 404 for invalid session ID', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': 'nonexistent-session-id',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(res.status).toBe(404);
  });

  it('CORS headers are present on all responses', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('OPTIONS returns 204 with CORS headers', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
  });
});
