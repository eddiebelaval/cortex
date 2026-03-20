#!/usr/bin/env node

/**
 * Cortex Compaction — Prune expired context objects.
 *
 * Runs the store's built-in compact() to delete anything past TTL,
 * then additionally removes stale 'state' objects older than 7 days
 * (state snapshots lose value quickly — branch/file info goes stale).
 */

import { ContextStore } from '../store/index.js';

const STALE_STATE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function main() {
  const store = new ContextStore();
  await store.init();

  // Phase 1: TTL-based compaction (built into the store)
  const expired = await store.compact();

  // Phase 2: Stale state cleanup — state objects older than 7 days
  const now = Date.now();
  const allContexts = await store.list({ type: 'state' });
  let staleCount = 0;

  for (const ctx of allContexts) {
    const age = now - new Date(ctx.timestamp).getTime();
    if (age > STALE_STATE_MS) {
      await store.delete(ctx.id);
      staleCount++;
    }
  }

  const total = expired + staleCount;
  if (total > 0) {
    console.error(`[cortex] Compacted: ${expired} expired, ${staleCount} stale state objects removed`);
  }
}

main();
