import type { ContextObject } from '../types/index.js';

export function formatAge(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(ms / (1000 * 60));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

import type { ContextType } from '../types/index.js';

const TYPE_ORDER: ContextType[] = ['decision', 'priority', 'insight', 'artifact', 'state', 'blocker'];

const TYPE_LABELS: Record<string, string> = {
  decision: 'Decisions',
  priority: 'Priorities',
  insight: 'Insights',
  artifact: 'Artifacts',
  state: 'States',
  blocker: 'Blockers',
};

export interface StoreSummary {
  byType: Map<string, number>;
  byProject: Map<string, number>;
  bySurface: Map<string, number>;
  total: number;
}

export function summarizeContexts(contexts: ContextObject[]): StoreSummary {
  const byType = new Map<string, number>();
  const byProject = new Map<string, number>();
  const bySurface = new Map<string, number>();

  for (const ctx of contexts) {
    byType.set(ctx.type, (byType.get(ctx.type) ?? 0) + 1);
    const proj = ctx.project ?? '(global)';
    byProject.set(proj, (byProject.get(proj) ?? 0) + 1);
    bySurface.set(ctx.source_surface, (bySurface.get(ctx.source_surface) ?? 0) + 1);
  }

  return { byType, byProject, bySurface, total: contexts.length };
}

export function formatStoreSummary(summary: StoreSummary): string {
  let text = `Cortex Store: ${summary.total} context object(s)\n\n`;
  if (summary.byType.size > 0) {
    text += 'By type:\n';
    for (const [t, c] of summary.byType) text += `  ${t}: ${c}\n`;
    text += '\n';
  }
  if (summary.byProject.size > 0) {
    text += 'By project:\n';
    for (const [p, c] of summary.byProject) text += `  ${p}: ${c}\n`;
    text += '\n';
  }
  if (summary.bySurface.size > 0) {
    text += 'By surface:\n';
    for (const [s, c] of summary.bySurface) text += `  ${s}: ${c}\n`;
  }
  return text;
}

export function formatContextSummary(contexts: ContextObject[]): string {
  if (contexts.length === 0) return '';

  const grouped = new Map<string, ContextObject[]>();
  for (const ctx of contexts) {
    const group = grouped.get(ctx.type) ?? [];
    group.push(ctx);
    grouped.set(ctx.type, group);
  }

  let text = '';
  for (const type of TYPE_ORDER) {
    const items = grouped.get(type);
    if (!items || items.length === 0) continue;
    const label = TYPE_LABELS[type] ?? type;
    text += `## ${label}\n\n`;
    for (const ctx of items) {
      const age = formatAge(ctx.timestamp);
      const conf = ctx.confidence === 'high' ? '' : ` [${ctx.confidence}]`;
      text += `### ${ctx.title}${conf}\n`;
      text += `*${age} ago via ${ctx.source_surface}*\n\n`;
      text += `${ctx.body}\n\n`;
    }
  }

  return text;
}
