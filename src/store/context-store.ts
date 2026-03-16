import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import type { ContextObject, ContextType, ContextFilter, SyncState, CortexConfig, Surface } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';

const VALID_TYPES = new Set<string>(['decision', 'artifact', 'state', 'priority', 'blocker', 'insight']);
const VALID_SURFACES = new Set<string>(['chat', 'code', 'api', 'desktop']);
const VALID_CONFIDENCE = new Set<string>(['high', 'medium', 'low']);
const VALID_TTL = new Set<string>(['persistent', 'session', '24h', '7d']);

const SURFACE_CONSUMES: Record<string, ContextType[]> = {
  code: ['decision', 'priority', 'insight'],
  chat: ['artifact', 'state', 'blocker'],
};

export class ContextStore {
  private storePath: string;
  private contextsPath: string;
  private surfacesPath: string;
  private config: CortexConfig;
  private index: Map<string, ContextObject> = new Map();

  constructor(config?: Partial<CortexConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storePath = resolve(this.config.storePath.replace(/^~/, homedir()));
    this.contextsPath = join(this.storePath, 'contexts');
    this.surfacesPath = join(this.storePath, 'surfaces');
  }

  async init(): Promise<void> {
    await mkdir(this.contextsPath, { recursive: true });
    await mkdir(this.surfacesPath, { recursive: true });
    await this.loadIndex();
  }

  private static readonly ID_PATTERN = /^ctx_[a-f0-9]{8}$/;

  static isValidId(id: string): boolean {
    return ContextStore.ID_PATTERN.test(id);
  }

  generateId(): string {
    return `ctx_${randomUUID().slice(0, 8)}`;
  }

  async write(context: ContextObject): Promise<string> {
    const { title, body, data, ...frontmatter } = context;

    const metadata: Record<string, unknown> = { ...frontmatter };
    if (data && Object.keys(data).length > 0) {
      metadata.structured_data = data;
    }

    const content = `# ${title}\n\n${body}`;
    const fileContent = matter.stringify(content, metadata);
    const filePath = join(this.contextsPath, `${context.id}.md`);
    await writeFile(filePath, fileContent, 'utf-8');

    this.index.set(context.id, context);
    return context.id;
  }

  async read(id: string): Promise<ContextObject | null> {
    if (this.index.has(id)) {
      return this.index.get(id)!;
    }
    if (!ContextStore.isValidId(id)) return null;
    return this.parseContextFile(join(this.contextsPath, `${id}.md`));
  }

  async list(filter?: ContextFilter): Promise<ContextObject[]> {
    const contexts = Array.from(this.index.values());
    if (!filter) return contexts;

    return contexts.filter((ctx) => {
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(ctx.type)) return false;
      }
      if (filter.project !== undefined && ctx.project !== filter.project) return false;
      if (filter.surface) {
        const surfaces = Array.isArray(filter.surface) ? filter.surface : [filter.surface];
        if (!surfaces.includes(ctx.source_surface)) return false;
      }
      if (filter.tags?.length && !filter.tags.some((tag) => ctx.tags.includes(tag))) return false;
      if (filter.since && new Date(ctx.timestamp) < new Date(filter.since)) return false;
      if (filter.confidence) {
        const confidences = Array.isArray(filter.confidence) ? filter.confidence : [filter.confidence];
        if (!confidences.includes(ctx.confidence)) return false;
      }
      if (filter.excludeExpired && this.isExpired(ctx)) return false;
      return true;
    });
  }

  async delete(id: string): Promise<boolean> {
    if (!this.index.has(id) && !ContextStore.isValidId(id)) return false;
    const filePath = join(this.contextsPath, `${id}.md`);
    try {
      await unlink(filePath);
      this.index.delete(id);
      return true;
    } catch {
      return false;
    }
  }

  async getForProject(project: string): Promise<ContextObject[]> {
    return this.list({
      project,
      excludeExpired: true,
    });
  }

  async getForSurface(project: string, targetSurface: string): Promise<ContextObject[]> {
    const all = await this.getForProject(project);
    const allowedTypes = SURFACE_CONSUMES[targetSurface];

    if (!allowedTypes) return all;

    return all.filter((ctx) =>
      ctx.source_surface !== targetSurface &&
      allowedTypes.includes(ctx.type)
    );
  }

  async getSyncState(surface: string): Promise<SyncState | null> {
    const filePath = join(this.surfacesPath, `${surface}.json`);
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as SyncState;
    } catch {
      return null;
    }
  }

  async updateSyncState(state: SyncState): Promise<void> {
    const filePath = join(this.surfacesPath, `${state.surface}.json`);
    await writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  async compact(): Promise<number> {
    const expired = [...this.index.entries()]
      .filter(([, ctx]) => this.isExpired(ctx))
      .map(([id]) => id);

    for (const id of expired) {
      await unlink(join(this.contextsPath, `${id}.md`)).catch(() => {});
      this.index.delete(id);
    }

    return expired.length;
  }

  async export(): Promise<ContextObject[]> {
    return Array.from(this.index.values());
  }

  get size(): number {
    return this.index.size;
  }

  // --- Private ---

  private async loadIndex(): Promise<void> {
    this.index.clear();

    let files: string[];
    try {
      files = await readdir(this.contextsPath);
    } catch {
      return;
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'));
    const results = await Promise.all(
      mdFiles.map((f) => this.parseContextFile(join(this.contextsPath, f)))
    );

    for (const ctx of results) {
      if (ctx) {
        this.index.set(ctx.id, ctx);
      }
    }
  }

  private async parseContextFile(filePath: string): Promise<ContextObject | null> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;

      if (!data.id || !VALID_TYPES.has(data.type as string)) return null;
      if (!VALID_SURFACES.has(data.source_surface as string)) return null;

      const title = parsed.content.match(/^# (.+)$/m)?.[1] ?? 'Untitled';
      const bodyMatch = parsed.content.match(/^# .+\n\n([\s\S]*?)$/);
      const body = bodyMatch?.[1]?.trim() ?? parsed.content.trim();

      return {
        id: data.id as string,
        type: data.type as ContextObject['type'],
        source_surface: data.source_surface as ContextObject['source_surface'],
        timestamp: data.timestamp as string,
        project: (data.project as string) ?? null,
        confidence: VALID_CONFIDENCE.has(data.confidence as string)
          ? (data.confidence as ContextObject['confidence'])
          : 'medium',
        ttl: VALID_TTL.has(data.ttl as string)
          ? (data.ttl as ContextObject['ttl'])
          : 'persistent',
        supersedes: (data.supersedes as string) ?? null,
        tags: (data.tags as string[]) ?? [],
        title,
        body,
        data: data.structured_data as Record<string, unknown> | undefined,
      };
    } catch {
      return null;
    }
  }

  private isExpired(ctx: ContextObject): boolean {
    if (ctx.ttl === 'persistent') return false;

    const now = Date.now();
    const created = new Date(ctx.timestamp).getTime();

    switch (ctx.ttl) {
      case '24h':
        return now - created > 24 * 60 * 60 * 1000;
      case '7d':
        return now - created > 7 * 24 * 60 * 60 * 1000;
      case 'session':
        return now - created > 8 * 60 * 60 * 1000; // 8h
      default:
        return false;
    }
  }
}
