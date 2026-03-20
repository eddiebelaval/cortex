/**
 * Resolve a directory path to a Cortex project name.
 *
 * Reads ~/.cortex/config.yaml project mappings. Falls back to basename
 * if no mapping exists. Returns null if the directory is mapped to "~" (skip).
 */

import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { homedir } from 'node:os';

interface ProjectMap {
  [dir: string]: string;
}

let cachedMap: ProjectMap | null = null;

function loadProjectMap(): ProjectMap {
  if (cachedMap) return cachedMap;

  try {
    const configPath = resolve(homedir(), '.cortex', 'config.yaml');
    const raw = readFileSync(configPath, 'utf-8');

    // Simple YAML parsing for the projects section — no dependency needed
    const projectsMatch = raw.match(/^projects:\n((?:\s+.+\n?)*)/m);
    if (!projectsMatch) return (cachedMap = {});

    const map: ProjectMap = {};
    const lines = projectsMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^\s+(~?\S+):\s+(.+)$/);
      if (match) {
        const dir = match[1].replace(/^~/, homedir());
        map[dir] = match[2].trim();
      }
    }

    cachedMap = map;
    return map;
  } catch {
    return (cachedMap = {});
  }
}

export function resolveProject(dir: string): string | null {
  const map = loadProjectMap();
  const resolved = resolve(dir.replace(/^~/, homedir()));

  // Exact match first — this handles skip mappings ("~") precisely
  for (const [mappedDir, project] of Object.entries(map)) {
    const normalizedMapped = resolve(mappedDir);
    if (resolved === normalizedMapped) {
      return project === '~' ? null : project;
    }
  }

  // Then try parent directory match — most specific wins (longest path)
  // Skip entries ("~") only match exactly, not as parent directories
  let bestMatch = '';
  let bestProject = '';

  for (const [mappedDir, project] of Object.entries(map)) {
    if (project === '~') continue; // Skip entries don't propagate to children
    const normalizedMapped = resolve(mappedDir);
    if (resolved.startsWith(normalizedMapped + '/') && normalizedMapped.length > bestMatch.length) {
      bestMatch = normalizedMapped;
      bestProject = project;
    }
  }

  if (bestProject) return bestProject;

  // Fallback: basename of the directory
  return basename(resolved);
}
