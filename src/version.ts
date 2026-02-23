import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let cached: string | undefined;

export function getVersion(): string {
  if (cached) return cached;
  // Try multiple paths to handle both bundled (dist/bin/, dist/) and source contexts
  const candidates = [
    join(import.meta.dirname, '..', 'package.json'),
    join(import.meta.dirname, '..', '..', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf-8'));
        if (pkg.name === 'dockerdoctor' && pkg.version) {
          cached = pkg.version;
          return cached;
        }
      }
    } catch {
      // continue to next candidate
    }
  }
  cached = '0.0.0';
  return cached;
}
