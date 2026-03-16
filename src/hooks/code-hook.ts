/**
 * Claude Code Hook — Cortex Context Extraction
 *
 * This module provides the logic for a Claude Code PostToolUse hook
 * that automatically extracts context from coding sessions and writes
 * it to the Cortex store.
 *
 * Install as a Claude Code hook:
 *   PostToolUse (Bash — git commit): cortex hook commit
 *   PreToolUse (session start): cortex hook inject <project>
 */

import { ContextStore } from '../store/index.js';
import type { ContextObject, ContextType, Confidence } from '../types/index.js';

export interface CommitInfo {
  hash: string;
  message: string;
  branch: string;
  filesChanged: string[];
  project: string;
}

export interface SessionState {
  project: string;
  branch: string;
  activeFiles: string[];
  failingTests: string[];
  todos: string[];
}

export function commitToContext(commit: CommitInfo, store: ContextStore): ContextObject {
  const isFeature = commit.message.startsWith('feat');
  const isFix = commit.message.startsWith('fix');

  const type: ContextType = 'artifact';
  const confidence: Confidence = 'high';

  return {
    id: store.generateId(),
    type,
    source_surface: 'code',
    timestamp: new Date().toISOString(),
    project: commit.project,
    confidence,
    ttl: 'persistent',
    supersedes: null,
    tags: [
      commit.branch,
      ...(isFeature ? ['feature'] : []),
      ...(isFix ? ['bugfix'] : []),
    ],
    title: commit.message.split('\n')[0],
    body: [
      `Commit \`${commit.hash}\` on branch \`${commit.branch}\`.`,
      '',
      `Files changed: ${commit.filesChanged.length}`,
      ...commit.filesChanged.map((f) => `- ${f}`),
    ].join('\n'),
    data: {
      commit_hash: commit.hash,
      branch: commit.branch,
      files_changed: commit.filesChanged,
    },
  };
}

export function sessionToContext(session: SessionState, store: ContextStore): ContextObject {
  const hasBlockers = session.failingTests.length > 0;

  return {
    id: store.generateId(),
    type: hasBlockers ? 'blocker' : 'state',
    source_surface: 'code',
    timestamp: new Date().toISOString(),
    project: session.project,
    confidence: 'high',
    ttl: 'session',
    supersedes: null,
    tags: ['session-state', session.branch],
    title: hasBlockers
      ? `Blocked: ${session.failingTests.length} failing test(s)`
      : `Working on ${session.branch}`,
    body: [
      `Branch: \`${session.branch}\``,
      '',
      session.activeFiles.length > 0
        ? `Active files:\n${session.activeFiles.map((f) => `- ${f}`).join('\n')}`
        : 'No active files tracked.',
      '',
      session.failingTests.length > 0
        ? `Failing tests:\n${session.failingTests.map((t) => `- ${t}`).join('\n')}`
        : 'All tests passing.',
      '',
      session.todos.length > 0
        ? `TODOs:\n${session.todos.map((t) => `- ${t}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    data: {
      branch: session.branch,
      active_files: session.activeFiles,
      failing_tests: session.failingTests,
      todos: session.todos,
    },
  };
}
