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
import { git, gitLines, resolveProject } from '../utils/index.js';

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
    const filesChanged = gitLines('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD');
    const projectDir = git('rev-parse', '--show-toplevel');
    const project = resolveProject(projectDir);
    if (!project) process.exit(0); // Skip directories mapped to "~"

    if (!hash || !message || !branch) process.exit(0);

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
