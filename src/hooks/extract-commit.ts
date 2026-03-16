#!/usr/bin/env node

/**
 * Claude Code PostToolUse Hook — Extract context from git commits.
 *
 * Reads hook JSON from stdin, detects git commit commands,
 * extracts commit metadata via git CLI, and writes a context
 * object to the Cortex store.
 */

import { ContextStore } from '../store/index.js';
import { commitToContext } from './code-hook.js';
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
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookData: { tool_input?: { command?: string } };
  try {
    hookData = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const command = hookData.tool_input?.command ?? '';
  if (!command.includes('git commit')) {
    process.exit(0);
  }

  try {
    const hash = git('rev-parse', '--short', 'HEAD');
    const message = git('log', '-1', '--pretty=%B');
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    const filesRaw = git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD');
    const filesChanged = filesRaw ? filesRaw.split('\n') : [];
    const projectDir = git('rev-parse', '--show-toplevel');
    const project = basename(projectDir);

    if (!hash || !message) process.exit(0);

    const store = new ContextStore();
    await store.init();

    const context = commitToContext(
      { hash, message, branch, filesChanged, project },
      store,
    );

    await store.write(context);
    console.error(`[cortex] Captured: ${context.type} — "${context.title}" (${context.id})`);
  } catch (err) {
    console.error(`[cortex] Warning: ${err}`);
  }
}

main();
