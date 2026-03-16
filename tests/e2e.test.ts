import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import { ContextStore } from '../src/store/context-store.js';
import { commitToContext, sessionToContext } from '../src/hooks/code-hook.js';
import { formatContextSummary, summarizeContexts, formatStoreSummary } from '../src/utils/format.js';
import type { ContextObject } from '../src/types/context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(store: ContextStore, overrides: Partial<ContextObject> = {}): ContextObject {
  return {
    id: overrides.id ?? store.generateId(),
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

function pastTimestamp(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// 1. CLI E2E — Integration tests exercising the same pipeline as the CLI
// ---------------------------------------------------------------------------

describe('CLI E2E (integration)', () => {
  let store: ContextStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cortex-e2e-cli-'));
    store = new ContextStore({ storePath: tempDir });
    await store.init();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('status on empty store reports 0 context objects', async () => {
    const all = await store.export();
    const summary = summarizeContexts(all);
    const output = formatStoreSummary(summary);
    expect(output).toContain('0 context object(s)');
  });

  it('list shows written context', async () => {
    const ctx = makeContext(store, { title: 'Use Supabase for auth' });
    await store.write(ctx);

    const contexts = await store.list({ excludeExpired: true });
    expect(contexts).toHaveLength(1);
    expect(contexts[0].title).toBe('Use Supabase for auth');
    expect(contexts[0].id).toBe(ctx.id);
  });

  it('show displays the correct context', async () => {
    const ctx = makeContext(store, {
      title: 'Pick React Query',
      body: 'We chose React Query for server state.',
      type: 'decision',
      source_surface: 'chat',
      project: 'homer',
      confidence: 'high',
      ttl: 'persistent',
      tags: ['architecture'],
    });
    await store.write(ctx);

    const read = await store.read(ctx.id);
    expect(read).not.toBeNull();
    expect(read!.title).toBe('Pick React Query');
    expect(read!.body).toBe('We chose React Query for server state.');
    expect(read!.type).toBe('decision');
    expect(read!.source_surface).toBe('chat');
    expect(read!.project).toBe('homer');
    expect(read!.confidence).toBe('high');
    expect(read!.tags).toContain('architecture');
  });

  it('delete removes the context', async () => {
    const ctx = makeContext(store);
    await store.write(ctx);
    expect(store.size).toBe(1);

    const deleted = await store.delete(ctx.id);
    expect(deleted).toBe(true);
    expect(store.size).toBe(0);
    expect(await store.read(ctx.id)).toBeNull();
  });

  it('export returns valid JSON array of all contexts', async () => {
    const ctx1 = makeContext(store, { title: 'First' });
    const ctx2 = makeContext(store, { title: 'Second', type: 'insight' });
    await store.write(ctx1);
    await store.write(ctx2);

    const exported = await store.export();
    const json = JSON.parse(JSON.stringify(exported));
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(2);
    expect(json.map((c: ContextObject) => c.title)).toContain('First');
    expect(json.map((c: ContextObject) => c.title)).toContain('Second');
  });

  it('compact removes expired contexts', async () => {
    const expired = makeContext(store, {
      ttl: '24h',
      timestamp: pastTimestamp(25),
      title: 'Old one',
    });
    const fresh = makeContext(store, {
      ttl: '24h',
      timestamp: new Date().toISOString(),
      title: 'Fresh one',
    });
    await store.write(expired);
    await store.write(fresh);
    expect(store.size).toBe(2);

    const removed = await store.compact();
    expect(removed).toBe(1);
    expect(store.size).toBe(1);

    const remaining = await store.list();
    expect(remaining[0].title).toBe('Fresh one');
  });

  it('inject outputs markdown when cross-surface context exists', async () => {
    // Decision from chat should be visible to code surface
    const decision = makeContext(store, {
      type: 'decision',
      source_surface: 'chat',
      project: 'homer',
      title: 'Use OTP auth',
      body: 'Email OTP only, no passwords.',
    });
    await store.write(decision);

    const contexts = await store.getForSurface('homer', 'code');
    expect(contexts).toHaveLength(1);

    const md = formatContextSummary(contexts);
    expect(md).toContain('Use OTP auth');
    expect(md).toContain('Email OTP only, no passwords.');
    expect(md).toContain('## Decisions');
  });

  it('inject returns empty when no cross-surface context', async () => {
    // code artifact should NOT be visible to code surface (same surface)
    const artifact = makeContext(store, {
      type: 'artifact',
      source_surface: 'code',
      project: 'homer',
      title: 'Some artifact',
    });
    await store.write(artifact);

    const contexts = await store.getForSurface('homer', 'code');
    expect(contexts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. CLI binary smoke test — runs the compiled JS
// ---------------------------------------------------------------------------

describe('CLI binary', () => {
  let tempDir: string;
  let store: ContextStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cortex-e2e-bin-'));
    store = new ContextStore({ storePath: tempDir });
    await store.init();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('cortex --version outputs version number', () => {
    const cliPath = join(process.cwd(), 'dist', 'cli', 'index.js');
    const output = execFileSync('node', [cliPath, '--version'], {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim();
    expect(output).toBe('0.1.0');
  });

  it('cortex --help outputs usage', () => {
    const cliPath = join(process.cwd(), 'dist', 'cli', 'index.js');
    const output = execFileSync('node', [cliPath, '--help'], {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim();
    expect(output).toContain('cortex');
    expect(output).toContain('continuity protocol');
  });
});

// ---------------------------------------------------------------------------
// 3. Hook E2E — Test hook scripts end-to-end
// ---------------------------------------------------------------------------

describe('Hook E2E', () => {
  let store: ContextStore;
  let tempDir: string;
  let gitDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cortex-e2e-hook-'));
    store = new ContextStore({ storePath: tempDir });
    await store.init();

    // Create a temp git repo for hooks that need one
    gitDir = await mkdtemp(join(tmpdir(), 'cortex-e2e-git-'));
    execFileSync('git', ['init', gitDir], { encoding: 'utf-8' });
    execFileSync('git', ['-C', gitDir, 'config', 'user.email', 'test@test.com'], { encoding: 'utf-8' });
    execFileSync('git', ['-C', gitDir, 'config', 'user.name', 'Test'], { encoding: 'utf-8' });

    // Create a file and initial commit so HEAD exists
    const testFile = join(gitDir, 'hello.txt');
    execFileSync('bash', ['-c', `echo "hello" > "${testFile}"`], { encoding: 'utf-8' });
    execFileSync('git', ['-C', gitDir, 'add', '.'], { encoding: 'utf-8' });
    execFileSync('git', ['-C', gitDir, 'commit', '-m', 'feat: initial commit'], { encoding: 'utf-8' });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(gitDir, { recursive: true, force: true });
  });

  it('extract-commit: commitToContext writes to store and round-trips', async () => {
    const hash = execFileSync('git', ['-C', gitDir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' }).trim();
    const message = execFileSync('git', ['-C', gitDir, 'log', '-1', '--pretty=%B'], { encoding: 'utf-8' }).trim();
    const branch = execFileSync('git', ['-C', gitDir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8' }).trim();

    const commit = {
      hash,
      message,
      branch,
      filesChanged: ['hello.txt'],
      project: 'test-repo',
    };

    const ctx = commitToContext(commit, store);
    await store.write(ctx);

    // Verify it persisted
    const read = await store.read(ctx.id);
    expect(read).not.toBeNull();
    expect(read!.type).toBe('artifact');
    expect(read!.source_surface).toBe('code');
    expect(read!.title).toBe('feat: initial commit');
    expect(read!.body).toContain(hash);
    expect(read!.body).toContain('hello.txt');
    expect(read!.data?.commit_hash).toBe(hash);
    expect(read!.tags).toContain(branch);
    expect(read!.tags).toContain('feature'); // starts with 'feat'
  });

  it('session-snapshot: sessionToContext captures branch and files', async () => {
    const branch = execFileSync('git', ['-C', gitDir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8' }).trim();

    // Modify a file to create an active change
    const modFile = join(gitDir, 'hello.txt');
    execFileSync('bash', ['-c', `echo "modified" >> "${modFile}"`], { encoding: 'utf-8' });

    const activeFiles = ['hello.txt'];

    const session = {
      project: 'test-repo',
      branch,
      activeFiles,
      failingTests: [],
      todos: ['Write more tests'],
    };

    const ctx = sessionToContext(session, store);
    await store.write(ctx);

    const read = await store.read(ctx.id);
    expect(read).not.toBeNull();
    expect(read!.type).toBe('state');
    expect(read!.ttl).toBe('session');
    expect(read!.title).toContain(branch);
    expect(read!.body).toContain('hello.txt');
    expect(read!.body).toContain('Write more tests');
    expect(read!.data?.branch).toBe(branch);
    expect(read!.data?.active_files).toEqual(['hello.txt']);
  });

  it('inject-context: formatContextSummary outputs formatted markdown', async () => {
    const decision = makeContext(store, {
      type: 'decision',
      source_surface: 'chat',
      project: 'homer',
      title: 'Use email OTP',
      body: 'No passwords, email OTP only via Supabase.',
    });
    const priority = makeContext(store, {
      type: 'priority',
      source_surface: 'chat',
      project: 'homer',
      title: 'Ship auth first',
      body: 'Auth is blocking everything else.',
    });
    await store.write(decision);
    await store.write(priority);

    const contexts = await store.getForSurface('homer', 'code');
    expect(contexts).toHaveLength(2);

    const md = formatContextSummary(contexts);
    expect(md).toContain('## Decisions');
    expect(md).toContain('## Priorities');
    expect(md).toContain('Use email OTP');
    expect(md).toContain('Ship auth first');
    expect(md).toContain('via chat');
  });
});

// ---------------------------------------------------------------------------
// 4. Store round-trip — Context survives write -> disk -> read
// ---------------------------------------------------------------------------

describe('Store round-trip', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cortex-e2e-roundtrip-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('context with ALL fields survives write -> new store instance -> read', async () => {
    const store1 = new ContextStore({ storePath: tempDir });
    await store1.init();

    const original: ContextObject = {
      id: store1.generateId(),
      type: 'decision',
      source_surface: 'chat',
      timestamp: '2026-03-15T12:00:00.000Z',
      project: 'homer',
      confidence: 'high',
      ttl: '7d',
      supersedes: 'ctx_00000000',
      tags: ['architecture', 'auth', 'critical'],
      title: 'Use Supabase Email OTP',
      body: 'We will use Supabase signInWithOtp for all authentication.\nNo passwords, no magic links.',
      data: {
        auth_method: 'email_otp',
        provider: 'supabase',
        decision_date: '2026-03-15',
        alternatives_considered: ['magic-link', 'password', 'social-oauth'],
      },
    };

    await store1.write(original);

    // Create a completely new store instance pointing to the same directory
    const store2 = new ContextStore({ storePath: tempDir });
    await store2.init();

    const read = await store2.read(original.id);
    expect(read).not.toBeNull();

    // Verify every field
    expect(read!.id).toBe(original.id);
    expect(read!.type).toBe(original.type);
    expect(read!.source_surface).toBe(original.source_surface);
    expect(read!.timestamp).toBe(original.timestamp);
    expect(read!.project).toBe(original.project);
    expect(read!.confidence).toBe(original.confidence);
    expect(read!.ttl).toBe(original.ttl);
    expect(read!.supersedes).toBe(original.supersedes);
    expect(read!.tags).toEqual(original.tags);
    expect(read!.title).toBe(original.title);
    expect(read!.body).toBe(original.body);
    expect(read!.data).toEqual(original.data);
  });

  it('.md file on disk has correct frontmatter and body', async () => {
    const store = new ContextStore({ storePath: tempDir });
    await store.init();

    const ctx = makeContext(store, {
      id: 'ctx_aabbccdd',
      type: 'insight',
      source_surface: 'code',
      project: 'cortex',
      confidence: 'medium',
      ttl: 'persistent',
      supersedes: null,
      tags: ['testing', 'e2e'],
      title: 'Tests are valuable',
      body: 'E2E tests catch integration issues that unit tests miss.',
      data: { coverage: 85 },
    });

    await store.write(ctx);

    const filePath = join(tempDir, 'contexts', 'ctx_aabbccdd.md');
    const raw = await readFile(filePath, 'utf-8');
    const parsed = matter(raw);

    // Frontmatter fields
    expect(parsed.data.id).toBe('ctx_aabbccdd');
    expect(parsed.data.type).toBe('insight');
    expect(parsed.data.source_surface).toBe('code');
    expect(parsed.data.project).toBe('cortex');
    expect(parsed.data.confidence).toBe('medium');
    expect(parsed.data.ttl).toBe('persistent');
    expect(parsed.data.tags).toEqual(['testing', 'e2e']);
    expect(parsed.data.structured_data).toEqual({ coverage: 85 });

    // Body content
    expect(parsed.content).toContain('# Tests are valuable');
    expect(parsed.content).toContain('E2E tests catch integration issues that unit tests miss.');
  });

  it('multiple contexts survive round-trip and maintain independence', async () => {
    const store1 = new ContextStore({ storePath: tempDir });
    await store1.init();

    const ctxA = makeContext(store1, { title: 'Context A', type: 'decision', project: 'alpha' });
    const ctxB = makeContext(store1, { title: 'Context B', type: 'artifact', project: 'beta' });
    const ctxC = makeContext(store1, { title: 'Context C', type: 'blocker', project: 'alpha' });

    await store1.write(ctxA);
    await store1.write(ctxB);
    await store1.write(ctxC);

    const store2 = new ContextStore({ storePath: tempDir });
    await store2.init();

    expect(store2.size).toBe(3);

    const alpha = await store2.list({ project: 'alpha' });
    expect(alpha).toHaveLength(2);

    const beta = await store2.list({ project: 'beta' });
    expect(beta).toHaveLength(1);
    expect(beta[0].title).toBe('Context B');
  });
});

// ---------------------------------------------------------------------------
// 5. Expiry lifecycle — TTL behavior
// ---------------------------------------------------------------------------

describe('Expiry lifecycle', () => {
  let store: ContextStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cortex-e2e-expiry-'));
    store = new ContextStore({ storePath: tempDir });
    await store.init();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('compact only removes truly expired contexts', async () => {
    // persistent — should survive (even if ancient)
    await store.write(makeContext(store, {
      ttl: 'persistent',
      timestamp: pastTimestamp(24 * 365), // 1 year ago
      title: 'Persistent ancient',
    }));

    // 24h — expired (25h ago)
    await store.write(makeContext(store, {
      ttl: '24h',
      timestamp: pastTimestamp(25),
      title: '24h expired',
    }));

    // 24h — still fresh (1h ago)
    await store.write(makeContext(store, {
      ttl: '24h',
      timestamp: pastTimestamp(1),
      title: '24h fresh',
    }));

    // 7d — expired (8 days ago)
    await store.write(makeContext(store, {
      ttl: '7d',
      timestamp: pastTimestamp(24 * 8),
      title: '7d expired',
    }));

    // 7d — still fresh (3 days ago)
    await store.write(makeContext(store, {
      ttl: '7d',
      timestamp: pastTimestamp(24 * 3),
      title: '7d fresh',
    }));

    // session — expired (9h ago, session = 8h)
    await store.write(makeContext(store, {
      ttl: 'session',
      timestamp: pastTimestamp(9),
      title: 'Session expired',
    }));

    // session — still fresh (2h ago)
    await store.write(makeContext(store, {
      ttl: 'session',
      timestamp: pastTimestamp(2),
      title: 'Session fresh',
    }));

    expect(store.size).toBe(7);

    const removed = await store.compact();
    expect(removed).toBe(3); // 24h expired, 7d expired, session expired
    expect(store.size).toBe(4);

    const remaining = await store.list();
    const titles = remaining.map((c) => c.title);
    expect(titles).toContain('Persistent ancient');
    expect(titles).toContain('24h fresh');
    expect(titles).toContain('7d fresh');
    expect(titles).toContain('Session fresh');
    expect(titles).not.toContain('24h expired');
    expect(titles).not.toContain('7d expired');
    expect(titles).not.toContain('Session expired');
  });

  it('session TTL expires after 8 hours', async () => {
    // Just under 8 hours — should survive
    await store.write(makeContext(store, {
      id: 'ctx_just_in',
      ttl: 'session',
      timestamp: pastTimestamp(7.9),
      title: 'Just under 8h',
    }));

    // Just over 8 hours — should expire
    await store.write(makeContext(store, {
      id: 'ctx_just_out',
      ttl: 'session',
      timestamp: pastTimestamp(8.1),
      title: 'Just over 8h',
    }));

    const removed = await store.compact();
    expect(removed).toBe(1);
    expect(await store.read('ctx_just_in')).not.toBeNull();
    expect(await store.read('ctx_just_out')).toBeNull();
  });

  it('expired contexts are excluded by list with excludeExpired', async () => {
    await store.write(makeContext(store, {
      ttl: '24h',
      timestamp: pastTimestamp(25),
      title: 'Expired',
    }));
    await store.write(makeContext(store, {
      ttl: 'persistent',
      title: 'Still here',
    }));

    const withExpired = await store.list();
    expect(withExpired).toHaveLength(2);

    const withoutExpired = await store.list({ excludeExpired: true });
    expect(withoutExpired).toHaveLength(1);
    expect(withoutExpired[0].title).toBe('Still here');
  });

  it('compact removes files from disk', async () => {
    const ctx = makeContext(store, {
      id: 'ctx_diskdel1',
      ttl: '24h',
      timestamp: pastTimestamp(25),
    });
    await store.write(ctx);

    const filePath = join(tempDir, 'contexts', 'ctx_diskdel1.md');
    const fileExistsBefore = await readFile(filePath, 'utf-8').then(() => true).catch(() => false);
    expect(fileExistsBefore).toBe(true);

    await store.compact();

    const fileExistsAfter = await readFile(filePath, 'utf-8').then(() => true).catch(() => false);
    expect(fileExistsAfter).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Surface contract — Cross-surface filtering
// ---------------------------------------------------------------------------

describe('Surface contract', () => {
  let store: ContextStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cortex-e2e-surface-'));
    store = new ContextStore({ storePath: tempDir });
    await store.init();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('getForSurface(project, "code") returns chat decisions but not code artifacts', async () => {
    // Decisions from chat — should appear in code surface
    await store.write(makeContext(store, {
      id: 'ctx_d1',
      type: 'decision',
      source_surface: 'chat',
      project: 'proj',
      title: 'Chat decision',
    }));

    // Artifacts from code — should NOT appear in code surface (same surface)
    await store.write(makeContext(store, {
      id: 'ctx_a1',
      type: 'artifact',
      source_surface: 'code',
      project: 'proj',
      title: 'Code artifact',
    }));

    const forCode = await store.getForSurface('proj', 'code');
    const ids = forCode.map((c) => c.id);
    expect(ids).toContain('ctx_d1');
    expect(ids).not.toContain('ctx_a1');
  });

  it('getForSurface(project, "chat") returns code artifacts but not chat decisions', async () => {
    // Artifacts from code — should appear in chat surface
    await store.write(makeContext(store, {
      id: 'ctx_a2',
      type: 'artifact',
      source_surface: 'code',
      project: 'proj',
      title: 'Code artifact',
    }));

    // Decisions from chat — should NOT appear in chat surface (same surface)
    await store.write(makeContext(store, {
      id: 'ctx_d2',
      type: 'decision',
      source_surface: 'chat',
      project: 'proj',
      title: 'Chat decision',
    }));

    const forChat = await store.getForSurface('proj', 'chat');
    const ids = forChat.map((c) => c.id);
    expect(ids).toContain('ctx_a2');
    expect(ids).not.toContain('ctx_d2');
  });

  it('code surface consumes decision, priority, insight from other surfaces', async () => {
    // All three types code consumes, all from chat
    await store.write(makeContext(store, {
      id: 'ctx_cd', type: 'decision', source_surface: 'chat', project: 'p',
    }));
    await store.write(makeContext(store, {
      id: 'ctx_cp', type: 'priority', source_surface: 'chat', project: 'p',
    }));
    await store.write(makeContext(store, {
      id: 'ctx_ci', type: 'insight', source_surface: 'chat', project: 'p',
    }));

    // Types code does NOT consume
    await store.write(makeContext(store, {
      id: 'ctx_ca', type: 'artifact', source_surface: 'chat', project: 'p',
    }));
    await store.write(makeContext(store, {
      id: 'ctx_cs', type: 'state', source_surface: 'chat', project: 'p',
    }));
    await store.write(makeContext(store, {
      id: 'ctx_cb', type: 'blocker', source_surface: 'chat', project: 'p',
    }));

    const forCode = await store.getForSurface('p', 'code');
    const ids = forCode.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['ctx_cd', 'ctx_cp', 'ctx_ci']));
    expect(ids).not.toContain('ctx_ca');
    expect(ids).not.toContain('ctx_cs');
    expect(ids).not.toContain('ctx_cb');
    expect(forCode).toHaveLength(3);
  });

  it('chat surface consumes artifact, state, blocker from other surfaces', async () => {
    // All three types chat consumes, all from code
    await store.write(makeContext(store, {
      id: 'ctx_ha', type: 'artifact', source_surface: 'code', project: 'p',
    }));
    await store.write(makeContext(store, {
      id: 'ctx_hs', type: 'state', source_surface: 'code', project: 'p',
    }));
    await store.write(makeContext(store, {
      id: 'ctx_hb', type: 'blocker', source_surface: 'code', project: 'p',
    }));

    // Types chat does NOT consume
    await store.write(makeContext(store, {
      id: 'ctx_hd', type: 'decision', source_surface: 'code', project: 'p',
    }));
    await store.write(makeContext(store, {
      id: 'ctx_hp', type: 'priority', source_surface: 'code', project: 'p',
    }));
    await store.write(makeContext(store, {
      id: 'ctx_hi', type: 'insight', source_surface: 'code', project: 'p',
    }));

    const forChat = await store.getForSurface('p', 'chat');
    const ids = forChat.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['ctx_ha', 'ctx_hs', 'ctx_hb']));
    expect(ids).not.toContain('ctx_hd');
    expect(ids).not.toContain('ctx_hp');
    expect(ids).not.toContain('ctx_hi');
    expect(forChat).toHaveLength(3);
  });

  it('cross-surface excludes same-surface regardless of type match', async () => {
    // Decision from code — code consumes decisions, but this is SAME surface
    await store.write(makeContext(store, {
      id: 'ctx_same',
      type: 'decision',
      source_surface: 'code',
      project: 'p',
    }));

    const forCode = await store.getForSurface('p', 'code');
    expect(forCode).toHaveLength(0);
  });

  it('different projects do not leak into each other', async () => {
    await store.write(makeContext(store, {
      id: 'ctx_pa',
      type: 'decision',
      source_surface: 'chat',
      project: 'alpha',
    }));
    await store.write(makeContext(store, {
      id: 'ctx_pb',
      type: 'decision',
      source_surface: 'chat',
      project: 'beta',
    }));

    const forAlpha = await store.getForSurface('alpha', 'code');
    expect(forAlpha).toHaveLength(1);
    expect(forAlpha[0].id).toBe('ctx_pa');

    const forBeta = await store.getForSurface('beta', 'code');
    expect(forBeta).toHaveLength(1);
    expect(forBeta[0].id).toBe('ctx_pb');
  });
});
