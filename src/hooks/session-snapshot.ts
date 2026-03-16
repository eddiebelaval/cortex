#!/usr/bin/env node

/**
 * Cortex Session Snapshot — Captures current session state.
 *
 * Run at session end to record branch, modified files, and TODOs.
 */

import { ContextStore } from '../store/index.js';
import { sessionToContext } from './code-hook.js';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

async function main() {
  const projectArg = process.argv[2];

  const projectDir = git('rev-parse', '--show-toplevel');
  if (!projectDir) {
    process.exit(0);
  }

  const project = projectArg ?? basename(projectDir);
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const modifiedRaw = git('diff', '--name-only');
  const stagedRaw = git('diff', '--cached', '--name-only');
  const activeFiles = [...new Set([
    ...(modifiedRaw ? modifiedRaw.split('\n') : []),
    ...(stagedRaw ? stagedRaw.split('\n') : []),
  ])];

  const store = new ContextStore();
  await store.init();

  // Supersede previous session state for this project
  const existing = await store.list({ type: 'state', project });
  const latestState = existing
    .filter((ctx) => ctx.source_surface === 'code')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  const context = sessionToContext(
    { project, branch, activeFiles, failingTests: [], todos: [] },
    store,
  );

  if (latestState) {
    context.supersedes = latestState.id;
  }

  await store.write(context);
  console.error(`[cortex] Session snapshot: ${context.id} — ${project} on ${branch} (${activeFiles.length} active files)`);
}

main();
