export { ContextStore } from './store/index.js';
export { commitToContext, sessionToContext } from './hooks/index.js';
export type {
  ContextObject,
  ContextType,
  Surface,
  Confidence,
  TTL,
  ContextFilter,
  SyncState,
  CortexConfig,
} from './types/index.js';
export { DEFAULT_CONFIG } from './types/index.js';
export type { CommitInfo, SessionState } from './hooks/index.js';
export { formatAge, summarizeContexts, formatStoreSummary, formatContextSummary } from './utils/index.js';
export type { StoreSummary } from './utils/index.js';
