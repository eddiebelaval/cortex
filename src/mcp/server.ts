#!/usr/bin/env node

/**
 * Cortex MCP Server
 *
 * Exposes the Cortex context store as MCP tools that Claude Code
 * can call natively. This is the primary integration point —
 * Claude queries and writes context through tool calls rather
 * than reading flat files.
 *
 * Tools:
 *   cortex_query   — Search context objects by type, project, surface
 *   cortex_write   — Create a new context object
 *   cortex_status  — Show store summary
 *   cortex_show    — View a specific context object
 *   cortex_delete  — Remove a context object
 *   cortex_inject  — Get cross-surface context for a project
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ContextStore } from '../store/index.js';
import { formatAge, summarizeContexts, formatStoreSummary, formatContextSummary } from '../utils/index.js';
import type { ContextType, Surface, Confidence, TTL } from '../types/index.js';

const store = new ContextStore();

const server = new Server(
  {
    name: 'cortex',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'cortex_query',
      description:
        'Search the Cortex context store. Returns context objects from other Claude surfaces (Chat decisions, Code artifacts, etc.) filtered by type, project, and surface.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project: {
            type: 'string',
            description: 'Filter by project name (e.g., "parallax", "homer")',
          },
          type: {
            type: 'string',
            enum: ['decision', 'artifact', 'state', 'priority', 'blocker', 'insight'],
            description: 'Filter by context type',
          },
          surface: {
            type: 'string',
            enum: ['chat', 'code', 'api', 'desktop'],
            description: 'Filter by source surface',
          },
          since: {
            type: 'string',
            description: 'Only show contexts after this ISO date',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by tags',
          },
        },
      },
    },
    {
      name: 'cortex_write',
      description:
        'Write a new context object to the Cortex store. Use this to record decisions, priorities, insights, or blockers that should be visible to other Claude surfaces.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            enum: ['decision', 'artifact', 'state', 'priority', 'blocker', 'insight'],
            description: 'The type of context object',
          },
          title: {
            type: 'string',
            description: 'Short title for the context',
          },
          body: {
            type: 'string',
            description: 'Detailed description',
          },
          project: {
            type: 'string',
            description: 'Project this context belongs to (null for global)',
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'How certain is this context (default: high)',
          },
          ttl: {
            type: 'string',
            enum: ['persistent', 'session', '24h', '7d'],
            description: 'When does this context expire (default: persistent)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for categorization',
          },
          supersedes: {
            type: 'string',
            description: 'ID of a context object this replaces',
          },
          source_surface: {
            type: 'string',
            enum: ['chat', 'code', 'api', 'desktop'],
            description: 'Which surface is producing this context (default: code)',
          },
        },
        required: ['type', 'title', 'body'],
      },
    },
    {
      name: 'cortex_status',
      description:
        'Show a summary of the Cortex context store — total objects, breakdown by type, project, and surface.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'cortex_show',
      description: 'View the full details of a specific context object by ID.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: {
            type: 'string',
            description: 'The context object ID (e.g., ctx_a1b2c3d4)',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'cortex_delete',
      description: 'Remove a context object from the store.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: {
            type: 'string',
            description: 'The context object ID to delete',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'cortex_inject',
      description:
        'Get all cross-surface context relevant to a project. Returns decisions, priorities, and insights from Chat that Code should know about (or vice versa). Use this at session start to load context.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project: {
            type: 'string',
            description: 'The project to get context for',
          },
          surface: {
            type: 'string',
            enum: ['chat', 'code', 'api', 'desktop'],
            description: 'The consuming surface (default: code)',
          },
        },
        required: ['project'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = (args ?? {}) as Record<string, unknown>;

  switch (name) {
    case 'cortex_query': {
      const contexts = await store.list({
        type: params.type as ContextType | undefined,
        project: params.project as string | undefined,
        surface: params.surface as Surface | undefined,
        since: params.since as string | undefined,
        tags: params.tags as string[] | undefined,
        excludeExpired: true,
      });

      if (contexts.length === 0) {
        return { content: [{ type: 'text', text: 'No context objects found matching the filter.' }] };
      }

      const lines = contexts.map((ctx) => {
        const age = formatAge(ctx.timestamp);
        return `**${ctx.title}** (${ctx.id})\n  Type: ${ctx.type} | Surface: ${ctx.source_surface} | Project: ${ctx.project ?? '(global)'} | ${age} ago | Confidence: ${ctx.confidence}\n  ${ctx.body.split('\n')[0]}`;
      });

      return {
        content: [{ type: 'text', text: `${contexts.length} context(s) found:\n\n${lines.join('\n\n')}` }],
      };
    }

    case 'cortex_write': {
      const context = {
        id: store.generateId(),
        type: params.type as ContextType,
        source_surface: (params.source_surface as Surface) ?? 'code',
        timestamp: new Date().toISOString(),
        project: (params.project as string) ?? null,
        confidence: (params.confidence as Confidence) ?? 'high',
        ttl: (params.ttl as TTL) ?? 'persistent',
        supersedes: (params.supersedes as string) ?? null,
        tags: (params.tags as string[]) ?? [],
        title: params.title as string,
        body: params.body as string,
      };

      const id = await store.write(context);
      return {
        content: [{ type: 'text', text: `Context written: ${id} (${context.type}: "${context.title}")` }],
      };
    }

    case 'cortex_status': {
      const all = await store.export();
      const summary = summarizeContexts(all);
      return { content: [{ type: 'text', text: formatStoreSummary(summary) }] };
    }

    case 'cortex_show': {
      const ctx = await store.read(params.id as string);
      if (!ctx) {
        return { content: [{ type: 'text', text: `Context ${params.id} not found.` }] };
      }

      const text = [
        `--- ${ctx.id} ---`,
        `Type:       ${ctx.type}`,
        `Surface:    ${ctx.source_surface}`,
        `Project:    ${ctx.project ?? '(global)'}`,
        `Confidence: ${ctx.confidence}`,
        `TTL:        ${ctx.ttl}`,
        `Created:    ${ctx.timestamp}`,
        `Tags:       ${ctx.tags.length > 0 ? ctx.tags.join(', ') : '(none)'}`,
        ctx.supersedes ? `Supersedes: ${ctx.supersedes}` : null,
        '',
        `# ${ctx.title}`,
        '',
        ctx.body,
      ]
        .filter((line) => line !== null)
        .join('\n');

      return { content: [{ type: 'text', text }] };
    }

    case 'cortex_delete': {
      const success = await store.delete(params.id as string);
      return {
        content: [
          {
            type: 'text',
            text: success ? `Deleted ${params.id}` : `Context ${params.id} not found.`,
          },
        ],
      };
    }

    case 'cortex_inject': {
      const project = params.project as string;
      const surface = (params.surface as string) ?? 'code';
      const contexts = await store.getForSurface(project, surface);

      if (contexts.length === 0) {
        return {
          content: [{ type: 'text', text: `No cross-surface context for ${project}.` }],
        };
      }

      let text = `# Cortex — Cross-Surface Context for ${project}\n\n`;
      text += `${contexts.length} context(s) from other surfaces.\n\n`;
      text += formatContextSummary(contexts);

      return { content: [{ type: 'text', text }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
});

async function main() {
  await store.init();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[cortex-mcp] Fatal:', err);
  process.exit(1);
});
