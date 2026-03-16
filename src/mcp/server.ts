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
  await store.init();

  const { name, arguments: args } = request.params;

  switch (name) {
    case 'cortex_query': {
      const a = args as Record<string, unknown>;
      const contexts = await store.list({
        type: a.type as ContextType | undefined,
        project: a.project as string | undefined,
        surface: a.surface as Surface | undefined,
        since: a.since as string | undefined,
        tags: a.tags as string[] | undefined,
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
      const a = args as Record<string, unknown>;
      const context = {
        id: store.generateId(),
        type: a.type as ContextType,
        source_surface: 'code' as Surface,
        timestamp: new Date().toISOString(),
        project: (a.project as string) ?? null,
        confidence: (a.confidence as Confidence) ?? 'high',
        ttl: (a.ttl as TTL) ?? 'persistent',
        supersedes: (a.supersedes as string) ?? null,
        tags: (a.tags as string[]) ?? [],
        title: a.title as string,
        body: a.body as string,
      };

      const id = await store.write(context);
      return {
        content: [{ type: 'text', text: `Context written: ${id} (${context.type}: "${context.title}")` }],
      };
    }

    case 'cortex_status': {
      const all = await store.export();
      const byType = new Map<string, number>();
      const byProject = new Map<string, number>();
      const bySurface = new Map<string, number>();

      for (const ctx of all) {
        byType.set(ctx.type, (byType.get(ctx.type) ?? 0) + 1);
        const proj = ctx.project ?? '(global)';
        byProject.set(proj, (byProject.get(proj) ?? 0) + 1);
        bySurface.set(ctx.source_surface, (bySurface.get(ctx.source_surface) ?? 0) + 1);
      }

      let text = `Cortex Store: ${all.length} context object(s)\n\n`;
      if (byType.size > 0) {
        text += 'By type:\n';
        for (const [t, c] of byType) text += `  ${t}: ${c}\n`;
        text += '\n';
      }
      if (byProject.size > 0) {
        text += 'By project:\n';
        for (const [p, c] of byProject) text += `  ${p}: ${c}\n`;
        text += '\n';
      }
      if (bySurface.size > 0) {
        text += 'By surface:\n';
        for (const [s, c] of bySurface) text += `  ${s}: ${c}\n`;
      }

      return { content: [{ type: 'text', text }] };
    }

    case 'cortex_show': {
      const a = args as Record<string, unknown>;
      const ctx = await store.read(a.id as string);
      if (!ctx) {
        return { content: [{ type: 'text', text: `Context ${a.id} not found.` }] };
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
      const a = args as Record<string, unknown>;
      const success = await store.delete(a.id as string);
      return {
        content: [
          {
            type: 'text',
            text: success ? `Deleted ${a.id}` : `Context ${a.id} not found.`,
          },
        ],
      };
    }

    case 'cortex_inject': {
      const a = args as Record<string, unknown>;
      const project = a.project as string;
      const surface = (a.surface as string) ?? 'code';
      const contexts = await store.getForSurface(project, surface);

      if (contexts.length === 0) {
        return {
          content: [{ type: 'text', text: `No cross-surface context for ${project}.` }],
        };
      }

      let text = `# Cortex — Cross-Surface Context for ${project}\n\n`;
      text += `${contexts.length} context(s) from other surfaces.\n\n`;

      const typeOrder = ['decision', 'priority', 'insight', 'artifact', 'state', 'blocker'];
      const grouped = new Map<string, typeof contexts>();
      for (const ctx of contexts) {
        const group = grouped.get(ctx.type) ?? [];
        group.push(ctx);
        grouped.set(ctx.type, group);
      }

      for (const type of typeOrder) {
        const items = grouped.get(type);
        if (!items || items.length === 0) continue;
        const label = type.charAt(0).toUpperCase() + type.slice(1) + 's';
        text += `## ${label}\n\n`;
        for (const ctx of items) {
          const age = formatAge(ctx.timestamp);
          text += `### ${ctx.title}\n*${age} ago via ${ctx.source_surface}*\n\n${ctx.body}\n\n`;
        }
      }

      return { content: [{ type: 'text', text }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
});

function formatAge(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(ms / (1000 * 60));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[cortex-mcp] Fatal:', err);
  process.exit(1);
});
