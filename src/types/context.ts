/**
 * Core context object types for the Cortex protocol.
 *
 * A context object is a structured record of something Claude learned
 * or produced on one surface that would be valuable on another.
 */

export type ContextType =
  | 'decision'
  | 'artifact'
  | 'state'
  | 'priority'
  | 'blocker'
  | 'insight';

export type Surface = 'chat' | 'code' | 'api' | 'desktop';

export type Confidence = 'high' | 'medium' | 'low';

export type TTL = 'persistent' | 'session' | '24h' | '7d';

export interface ContextObject {
  id: string;
  type: ContextType;
  source_surface: Surface;
  timestamp: string;
  project: string | null;
  confidence: Confidence;
  ttl: TTL;
  supersedes: string | null;
  tags: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ContextFilter {
  type?: ContextType | ContextType[];
  project?: string | null;
  surface?: Surface | Surface[];
  tags?: string[];
  since?: string;
  confidence?: Confidence | Confidence[];
  excludeExpired?: boolean;
}

export interface SyncState {
  surface: Surface;
  lastSync: string;
  pending: string[];
  version: number;
}

export interface CortexConfig {
  storePath: string;
  autoSync: boolean;
  projects: Record<string, string>;
  surfaces: Record<Surface, { enabled: boolean }>;
  maxContextAge: string;
  compactionThreshold: number;
}

export const DEFAULT_CONFIG: CortexConfig = {
  storePath: '~/.cortex',
  autoSync: true,
  projects: {},
  surfaces: {
    chat: { enabled: true },
    code: { enabled: true },
    api: { enabled: true },
    desktop: { enabled: true },
  },
  maxContextAge: '30d',
  compactionThreshold: 500,
};
