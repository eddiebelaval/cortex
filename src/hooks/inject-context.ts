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
import { formatContextSummary } from '../utils/index.js';

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
    process.exit(0);
  }

  console.log(`# Cortex — Cross-Surface Context`);
  console.log();
  console.log(`> ${contexts.length} context(s) synced from other surfaces.`);
  console.log(`> Last updated: ${new Date().toISOString()}`);
  console.log();
  console.log(formatContextSummary(contexts));
}

main();
