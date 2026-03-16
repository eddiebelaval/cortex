#!/usr/bin/env node

/**
 * Cortex Context Injector — Generates a context summary for a project.
 *
 * Reads the Cortex store and outputs a markdown summary of cross-surface
 * context relevant to the given project. Designed to be piped into
 * .claude/cortex/context.md or included in CLAUDE.md.
 *
 * Usage:
 *   node dist/hooks/inject-context.js <project-name> [surface]
 *
 * Example:
 *   node dist/hooks/inject-context.js parallax code > .claude/cortex/context.md
 */

import { ContextStore } from '../store/index.js';

async function main() {
  const project = process.argv[2];
  const surface = process.argv[3] ?? 'code';

  if (!project) {
    console.error('Usage: inject-context <project> [surface]');
    process.exit(1);
  }

  const store = new ContextStore();
  await store.init();

  const contexts = await store.getForSurface(project, surface);

  if (contexts.length === 0) {
    // No context — output nothing (clean injection)
    process.exit(0);
  }

  console.log(`# Cortex — Cross-Surface Context`);
  console.log();
  console.log(`> ${contexts.length} context(s) synced from other surfaces.`);
  console.log(`> Last updated: ${new Date().toISOString()}`);
  console.log();

  // Group by type
  const grouped = new Map<string, typeof contexts>();
  for (const ctx of contexts) {
    const group = grouped.get(ctx.type) ?? [];
    group.push(ctx);
    grouped.set(ctx.type, group);
  }

  // Priority order: decisions first, then priorities, then insights, then rest
  const typeOrder = ['decision', 'priority', 'insight', 'artifact', 'state', 'blocker'];

  for (const type of typeOrder) {
    const items = grouped.get(type);
    if (!items || items.length === 0) continue;

    const label = type.charAt(0).toUpperCase() + type.slice(1) + 's';
    console.log(`## ${label}`);
    console.log();

    for (const ctx of items) {
      const age = formatAge(ctx.timestamp);
      const conf = ctx.confidence === 'high' ? '' : ` [${ctx.confidence}]`;
      console.log(`### ${ctx.title}${conf}`);
      console.log(`*${age} ago via ${ctx.source_surface}*`);
      console.log();
      console.log(ctx.body);
      console.log();
    }
  }
}

function formatAge(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(ms / (1000 * 60));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

main();
