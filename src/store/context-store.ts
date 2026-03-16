import { readFile, writeFile, readdir, mkdir, unlink, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import type { ContextObject, ContextFilter, SyncState, CortexConfig } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';

export class ContextStore {
  private storePath: string;
  private contextsPath: string;
  private surfacesPath: string;
  private config: CortexConfig;
  private index: Map<string, ContextObject> = new Map();

  constructor(config?: Partial<CortexConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storePath = resolve(this.config.storePath.replace('~', homedir()));
    this.contextsPath = join(this.storePath, 'contexts');
    this.surfacesPath = join(this.storePath, 'surfaces');
  }

  async init(): Promise<void> {
    await mkdir(this.contextsPath, { recursive: true });
    await mkdir(this.surfacesPath, { recursive: true });
    await this.loadIndex();
  }

  generateId(): string {
    return `ctx_${randomUUID().slice(0, 8)}`;
  }

  async write(context: ContextObject): Promise<string> {
    const frontmatter: Record<string, unknown> = {
      id: context.id,
      type: context.type,
      source_surface: context.source_surface,
      timestamp: context.timestamp,
      project: context.project,
      confidence: context.confidence,
      ttl: context.ttl,
      supersedes: context.supersedes,
      tags: context.tags,
    };

    let content = `# ${context.title}\n\n${context.body}`;
    if (context.data && Object.keys(context.data).length > 0) {
      content += `\n\n## Structured Data\n\n\`\`\`yaml\n`;
      for (const [key, value] of Object.entries(context.data)) {
        content += `${key}: ${JSON.stringify(value)}\n`;
      }
      content += '```\n';
    }

    const fileContent = matter.stringify(content, frontmatter);
    const filePath = join(this.contextsPath, `${context.id}.md`);
    await writeFile(filePath, fileContent, 'utf-8');

    this.index.set(context.id, context);
    await this.saveIndex();

    return context.id;
  }

  async read(id: string): Promise<ContextObject | null> {
    if (this.index.has(id)) {
      return this.index.get(id)!;
    }

    const filePath = join(this.contextsPath, `${id}.md`);
    try {
      await access(filePath);
    } catch {
      return null;
    }

    return this.parseContextFile(filePath);
  }

  async list(filter?: ContextFilter): Promise<ContextObject[]> {
    const contexts = Array.from(this.index.values());
    if (!filter) return contexts;

    return contexts.filter((ctx) => {
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(ctx.type)) return false;
      }
      if (filter.project !== undefined) {
        if (ctx.project !== filter.project) return false;
      }
      if (filter.surface) {
        const surfaces = Array.isArray(filter.surface) ? filter.surface : [filter.surface];
        if (!surfaces.includes(ctx.source_surface)) return false;
      }
      if (filter.tags && filter.tags.length > 0) {
        if (!filter.tags.some((tag) => ctx.tags.includes(tag))) return false;
      }
      if (filter.since) {
        if (new Date(ctx.timestamp) < new Date(filter.since)) return false;
      }
      if (filter.confidence) {
        const confidences = Array.isArray(filter.confidence) ? filter.confidence : [filter.confidence];
        if (!confidences.includes(ctx.confidence)) return false;
      }
      if (filter.excludeExpired) {
        if (this.isExpired(ctx)) return false;
      }
      return true;
    });
  }

  async delete(id: string): Promise<boolean> {
    const filePath = join(this.contextsPath, `${id}.md`);
    try {
      await unlink(filePath);
      this.index.delete(id);
      await this.saveIndex();
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

    // Filter to contexts that the target surface should consume
    // Code consumes: decisions, priorities, insights from Chat
    // Chat consumes: artifacts, state, blockers from Code
    if (targetSurface === 'code') {
      return all.filter((ctx) =>
        ctx.source_surface !== 'code' &&
        ['decision', 'priority', 'insight'].includes(ctx.type)
      );
    }
    if (targetSurface === 'chat') {
      return all.filter((ctx) =>
        ctx.source_surface !== 'chat' &&
        ['artifact', 'state', 'blocker'].includes(ctx.type)
      );
    }
    return all;
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
    let removed = 0;
    for (const [id, ctx] of this.index) {
      if (this.isExpired(ctx)) {
        await this.delete(id);
        removed++;
      }
    }
    return removed;
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

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const ctx = await this.parseContextFile(join(this.contextsPath, file));
      if (ctx) {
        this.index.set(ctx.id, ctx);
      }
    }
  }

  private async saveIndex(): Promise<void> {
    const indexPath = join(this.storePath, 'index.json');
    const entries = Array.from(this.index.values()).map((ctx) => ({
      id: ctx.id,
      type: ctx.type,
      project: ctx.project,
      timestamp: ctx.timestamp,
      title: ctx.title,
    }));
    await writeFile(indexPath, JSON.stringify(entries, null, 2), 'utf-8');
  }

  private async parseContextFile(filePath: string): Promise<ContextObject | null> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;

      const title = parsed.content.match(/^# (.+)$/m)?.[1] ?? 'Untitled';
      const bodyMatch = parsed.content.match(/^# .+\n\n([\s\S]*?)(?:\n## Structured Data|$)/);
      const body = bodyMatch?.[1]?.trim() ?? parsed.content.trim();

      return {
        id: data.id as string,
        type: data.type as ContextObject['type'],
        source_surface: data.source_surface as ContextObject['source_surface'],
        timestamp: data.timestamp as string,
        project: (data.project as string) ?? null,
        confidence: data.confidence as ContextObject['confidence'],
        ttl: data.ttl as ContextObject['ttl'],
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
        return false; // Session TTL is managed by the surface, not the store
      default:
        return false;
    }
  }
}
