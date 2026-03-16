import { execFileSync } from 'node:child_process';

export function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}
