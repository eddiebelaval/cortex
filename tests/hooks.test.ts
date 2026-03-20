import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContextStore } from '../src/store/context-store.js';
import { commitToContext, sessionToContext } from '../src/hooks/code-hook.js';
import type { CommitInfo, SessionState } from '../src/hooks/code-hook.js';

describe('Hook functions', () => {
  let store: ContextStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cortex-hook-test-'));
    store = new ContextStore({ storePath: tempDir });
    await store.init();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('commitToContext', () => {
    it('produces correct context object', () => {
      const commit: CommitInfo = {
        hash: 'abc1234',
        message: 'refactor: clean up store logic',
        branch: 'main',
        filesChanged: ['src/store.ts', 'src/index.ts'],
        project: 'cortex',
      };

      const ctx = commitToContext(commit, store);

      expect(ctx.id).toMatch(/^ctx_/);
      expect(ctx.type).toBe('artifact');
      expect(ctx.source_surface).toBe('code');
      expect(ctx.project).toBe('cortex');
      expect(ctx.confidence).toBe('high');
      expect(ctx.ttl).toBe('7d');
      expect(ctx.supersedes).toBeNull();
      expect(ctx.title).toBe('refactor: clean up store logic');
      expect(ctx.body).toContain('abc1234');
      expect(ctx.body).toContain('Files changed: 2');
      expect(ctx.data?.commit_hash).toBe('abc1234');
      expect(ctx.data?.branch).toBe('main');
    });

    it('detects feat commits', () => {
      const commit: CommitInfo = {
        hash: 'def5678',
        message: 'feat: add context sync',
        branch: 'feature/sync',
        filesChanged: ['src/sync.ts'],
        project: 'cortex',
      };

      const ctx = commitToContext(commit, store);
      expect(ctx.tags).toContain('feature');
      expect(ctx.tags).not.toContain('bugfix');
    });

    it('detects fix commits', () => {
      const commit: CommitInfo = {
        hash: 'ghi9012',
        message: 'fix: handle null project in filter',
        branch: 'fix/null-project',
        filesChanged: ['src/store.ts'],
        project: 'cortex',
      };

      const ctx = commitToContext(commit, store);
      expect(ctx.tags).toContain('bugfix');
      expect(ctx.tags).not.toContain('feature');
    });

    it('includes branch in tags', () => {
      const commit: CommitInfo = {
        hash: 'jkl3456',
        message: 'docs: update README',
        branch: 'docs/readme',
        filesChanged: ['README.md'],
        project: 'cortex',
      };

      const ctx = commitToContext(commit, store);
      expect(ctx.tags).toContain('docs/readme');
    });
  });

  describe('sessionToContext', () => {
    it('produces state when no blockers', () => {
      const session: SessionState = {
        project: 'cortex',
        branch: 'main',
        activeFiles: ['src/store.ts'],
        failingTests: [],
        todos: ['Add compact tests'],
      };

      const ctx = sessionToContext(session, store);

      expect(ctx.type).toBe('state');
      expect(ctx.source_surface).toBe('code');
      expect(ctx.ttl).toBe('session');
      expect(ctx.title).toBe('Working on main');
      expect(ctx.tags).toContain('session-state');
      expect(ctx.tags).toContain('main');
      expect(ctx.body).toContain('All tests passing.');
      expect(ctx.body).toContain('src/store.ts');
      expect(ctx.data?.branch).toBe('main');
    });

    it('produces blocker when failing tests exist', () => {
      const session: SessionState = {
        project: 'cortex',
        branch: 'fix/broken',
        activeFiles: ['src/store.ts'],
        failingTests: ['store.test.ts > write fails', 'store.test.ts > read fails'],
        todos: [],
      };

      const ctx = sessionToContext(session, store);

      expect(ctx.type).toBe('blocker');
      expect(ctx.title).toBe('Blocked: 2 failing test(s)');
      expect(ctx.body).toContain('store.test.ts > write fails');
      expect(ctx.body).toContain('store.test.ts > read fails');
      expect(ctx.data?.failing_tests).toEqual([
        'store.test.ts > write fails',
        'store.test.ts > read fails',
      ]);
    });
  });
});
