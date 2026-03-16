import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContextStore } from '../src/store/context-store.js';
import type { ContextObject } from '../src/types/context.js';

function makeContext(overrides: Partial<ContextObject> = {}): ContextObject {
  return {
    id: overrides.id ?? 'ctx_test0001',
    type: 'decision',
    source_surface: 'chat',
    timestamp: new Date().toISOString(),
    project: 'test-project',
    confidence: 'high',
    ttl: 'persistent',
    supersedes: null,
    tags: ['test'],
    title: 'Test context',
    body: 'This is a test context object.',
    ...overrides,
  };
}

describe('ContextStore', () => {
  let store: ContextStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cortex-test-'));
    store = new ContextStore({ storePath: tempDir });
    await store.init();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('init creates directories', async () => {
    // Directories were created during beforeEach init
    await expect(access(join(tempDir, 'contexts'))).resolves.toBeUndefined();
    await expect(access(join(tempDir, 'surfaces'))).resolves.toBeUndefined();
  });

  it('write and read a context object', async () => {
    const ctx = makeContext();
    await store.write(ctx);
    const read = await store.read(ctx.id);

    expect(read).not.toBeNull();
    expect(read!.id).toBe(ctx.id);
    expect(read!.type).toBe('decision');
    expect(read!.title).toBe('Test context');
    expect(read!.body).toBe('This is a test context object.');
    expect(read!.project).toBe('test-project');
  });

  it('read returns null for nonexistent id', async () => {
    const result = await store.read('ctx_doesnotexist');
    expect(result).toBeNull();
  });

  it('list with no filter returns all', async () => {
    await store.write(makeContext({ id: 'ctx_aaa00001' }));
    await store.write(makeContext({ id: 'ctx_bbb00002', type: 'insight' }));

    const all = await store.list();
    expect(all).toHaveLength(2);
  });

  it('list with type filter', async () => {
    await store.write(makeContext({ id: 'ctx_t1', type: 'decision' }));
    await store.write(makeContext({ id: 'ctx_t2', type: 'insight' }));
    await store.write(makeContext({ id: 'ctx_t3', type: 'blocker' }));

    const decisions = await store.list({ type: 'decision' });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].type).toBe('decision');
  });

  it('list with project filter', async () => {
    await store.write(makeContext({ id: 'ctx_p1', project: 'alpha' }));
    await store.write(makeContext({ id: 'ctx_p2', project: 'beta' }));
    await store.write(makeContext({ id: 'ctx_p3', project: 'alpha' }));

    const alpha = await store.list({ project: 'alpha' });
    expect(alpha).toHaveLength(2);
    expect(alpha.every((c) => c.project === 'alpha')).toBe(true);
  });

  it('list with multiple filters', async () => {
    await store.write(makeContext({ id: 'ctx_m1', type: 'decision', project: 'alpha' }));
    await store.write(makeContext({ id: 'ctx_m2', type: 'insight', project: 'alpha' }));
    await store.write(makeContext({ id: 'ctx_m3', type: 'decision', project: 'beta' }));

    const result = await store.list({ type: 'decision', project: 'alpha' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ctx_m1');
  });

  it('delete removes from store and index', async () => {
    const ctx = makeContext({ id: 'ctx_del1' });
    await store.write(ctx);
    expect(store.size).toBe(1);

    const deleted = await store.delete('ctx_del1');
    expect(deleted).toBe(true);
    expect(store.size).toBe(0);

    const read = await store.read('ctx_del1');
    expect(read).toBeNull();
  });

  it('delete returns false for nonexistent id', async () => {
    const result = await store.delete('ctx_nope');
    expect(result).toBe(false);
  });

  it('compact removes expired 24h contexts', async () => {
    const expired = makeContext({
      id: 'ctx_exp24',
      ttl: '24h',
      timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });
    const fresh = makeContext({
      id: 'ctx_fresh24',
      ttl: '24h',
      timestamp: new Date().toISOString(),
    });
    await store.write(expired);
    await store.write(fresh);

    const removed = await store.compact();
    expect(removed).toBe(1);
    expect(store.size).toBe(1);
    expect(await store.read('ctx_fresh24')).not.toBeNull();
    expect(await store.read('ctx_exp24')).toBeNull();
  });

  it('compact removes expired 7d contexts', async () => {
    const expired = makeContext({
      id: 'ctx_exp7d',
      ttl: '7d',
      timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await store.write(expired);

    const removed = await store.compact();
    expect(removed).toBe(1);
    expect(store.size).toBe(0);
  });

  it('compact preserves persistent contexts', async () => {
    const persistent = makeContext({
      id: 'ctx_persist',
      ttl: 'persistent',
      timestamp: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await store.write(persistent);

    const removed = await store.compact();
    expect(removed).toBe(0);
    expect(store.size).toBe(1);
  });

  it('supersedes field is stored and retrieved correctly', async () => {
    const original = makeContext({ id: 'ctx_orig' });
    const replacement = makeContext({ id: 'ctx_repl', supersedes: 'ctx_orig' });

    await store.write(original);
    await store.write(replacement);

    const read = await store.read('ctx_repl');
    expect(read!.supersedes).toBe('ctx_orig');
  });

  it('getForSurface returns decisions/priorities/insights for code surface', async () => {
    // From chat -> code should include decisions, priorities, insights
    await store.write(makeContext({ id: 'ctx_s1', type: 'decision', source_surface: 'chat', project: 'proj' }));
    await store.write(makeContext({ id: 'ctx_s2', type: 'priority', source_surface: 'chat', project: 'proj' }));
    await store.write(makeContext({ id: 'ctx_s3', type: 'insight', source_surface: 'chat', project: 'proj' }));
    // From chat but wrong type — should be excluded
    await store.write(makeContext({ id: 'ctx_s4', type: 'artifact', source_surface: 'chat', project: 'proj' }));
    // From code — should be excluded (same surface)
    await store.write(makeContext({ id: 'ctx_s5', type: 'decision', source_surface: 'code', project: 'proj' }));

    const result = await store.getForSurface('proj', 'code');
    expect(result).toHaveLength(3);
    const ids = result.map((c) => c.id);
    expect(ids).toContain('ctx_s1');
    expect(ids).toContain('ctx_s2');
    expect(ids).toContain('ctx_s3');
  });

  it('getForSurface returns artifacts/state/blockers for chat surface', async () => {
    // From code -> chat should include artifacts, state, blockers
    await store.write(makeContext({ id: 'ctx_c1', type: 'artifact', source_surface: 'code', project: 'proj' }));
    await store.write(makeContext({ id: 'ctx_c2', type: 'state', source_surface: 'code', project: 'proj' }));
    await store.write(makeContext({ id: 'ctx_c3', type: 'blocker', source_surface: 'code', project: 'proj' }));
    // From code but wrong type — should be excluded
    await store.write(makeContext({ id: 'ctx_c4', type: 'decision', source_surface: 'code', project: 'proj' }));
    // From chat — should be excluded (same surface)
    await store.write(makeContext({ id: 'ctx_c5', type: 'artifact', source_surface: 'chat', project: 'proj' }));

    const result = await store.getForSurface('proj', 'chat');
    expect(result).toHaveLength(3);
    const ids = result.map((c) => c.id);
    expect(ids).toContain('ctx_c1');
    expect(ids).toContain('ctx_c2');
    expect(ids).toContain('ctx_c3');
  });

  it('generateId returns correct format', () => {
    const id = store.generateId();
    expect(id).toMatch(/^ctx_[a-f0-9]{8}$/);
  });
});
