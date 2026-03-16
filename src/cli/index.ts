#!/usr/bin/env node

import { Command } from 'commander';
import { ContextStore } from '../store/index.js';
import { formatAge, summarizeContexts, formatStoreSummary, formatContextSummary } from '../utils/index.js';

const store = new ContextStore();

const program = new Command();

program
  .name('cortex')
  .description('The continuity protocol for Claude surfaces')
  .version('0.1.0');

program
  .command('status')
  .description('Show what is in the store and pending sync')
  .action(async () => {
    await store.init();
    const all = await store.export();
    const summary = summarizeContexts(all);
    console.log('\n' + formatStoreSummary(summary));
  });

program
  .command('list')
  .description('List all context objects')
  .option('-t, --type <type>', 'Filter by type (decision, artifact, state, priority, blocker, insight)')
  .option('-p, --project <project>', 'Filter by project')
  .option('-s, --surface <surface>', 'Filter by source surface')
  .option('--since <date>', 'Show only contexts after this date')
  .action(async (opts) => {
    await store.init();
    const contexts = await store.list({
      type: opts.type,
      project: opts.project,
      surface: opts.surface,
      since: opts.since,
      excludeExpired: true,
    });

    if (contexts.length === 0) {
      console.log('No context objects found.');
      return;
    }

    for (const ctx of contexts) {
      const project = ctx.project ?? '(global)';
      const age = formatAge(ctx.timestamp);
      console.log(`${ctx.id}  ${ctx.type.padEnd(10)} ${project.padEnd(16)} ${age.padEnd(8)} ${ctx.title}`);
    }
    console.log(`\n${contexts.length} context(s)`);
  });

program
  .command('show <id>')
  .description('View a specific context object')
  .action(async (id: string) => {
    await store.init();
    const ctx = await store.read(id);

    if (!ctx) {
      console.error(`Context ${id} not found.`);
      process.exit(1);
    }

    console.log(`\n--- ${ctx.id} ---`);
    console.log(`Type:       ${ctx.type}`);
    console.log(`Surface:    ${ctx.source_surface}`);
    console.log(`Project:    ${ctx.project ?? '(global)'}`);
    console.log(`Confidence: ${ctx.confidence}`);
    console.log(`TTL:        ${ctx.ttl}`);
    console.log(`Created:    ${ctx.timestamp}`);
    console.log(`Tags:       ${ctx.tags.length > 0 ? ctx.tags.join(', ') : '(none)'}`);
    if (ctx.supersedes) console.log(`Supersedes: ${ctx.supersedes}`);
    console.log(`\n# ${ctx.title}\n`);
    console.log(ctx.body);
  });

program
  .command('delete <id>')
  .description('Remove a context object')
  .action(async (id: string) => {
    await store.init();
    const success = await store.delete(id);
    if (success) {
      console.log(`Deleted ${id}`);
    } else {
      console.error(`Context ${id} not found.`);
      process.exit(1);
    }
  });

program
  .command('compact')
  .description('Remove expired context objects')
  .action(async () => {
    await store.init();
    const removed = await store.compact();
    console.log(`Compacted: removed ${removed} expired context(s). ${store.size} remaining.`);
  });

program
  .command('export')
  .description('Export the full store as JSON')
  .action(async () => {
    await store.init();
    const all = await store.export();
    console.log(JSON.stringify(all, null, 2));
  });

program
  .command('inject <project>')
  .description('Output context summary for a project (used by Claude Code hooks)')
  .option('-s, --surface <surface>', 'Target surface', 'code')
  .action(async (project: string, opts) => {
    await store.init();
    const contexts = await store.getForSurface(project, opts.surface);

    if (contexts.length === 0) {
      return;
    }

    console.log(`# Cortex — Cross-Surface Context for ${project}\n`);
    console.log(`> ${contexts.length} context(s) from other surfaces. Updated ${new Date().toISOString()}.\n`);
    console.log(formatContextSummary(contexts));
  });

program.parse();
