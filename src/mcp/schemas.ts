import { z } from 'zod';

const contextType = z.enum(['decision', 'artifact', 'state', 'priority', 'blocker', 'insight']);
const surface = z.enum(['chat', 'code', 'api', 'desktop']);
const confidence = z.enum(['high', 'medium', 'low']);
const ttl = z.enum(['persistent', 'session', '24h', '7d']);

export const querySchema = z.object({
  project: z.string().optional(),
  type: contextType.optional(),
  surface: surface.optional(),
  since: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).strict();

export const writeSchema = z.object({
  type: contextType,
  title: z.string().min(1),
  body: z.string().min(1),
  project: z.string().nullable().optional(),
  confidence: confidence.optional().default('high'),
  ttl: ttl.optional().default('persistent'),
  tags: z.array(z.string()).optional().default([]),
  supersedes: z.string().nullable().optional().default(null),
  source_surface: surface.optional().default('code'),
}).strict();

export const idSchema = z.object({
  id: z.string().min(1),
}).strict();

export const injectSchema = z.object({
  project: z.string().min(1),
  surface: surface.optional().default('code'),
}).strict();
