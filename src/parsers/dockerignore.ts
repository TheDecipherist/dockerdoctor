import type { ParsedDockerignore, DockerignoreEntry } from '../types/index.js';

export function parseDockerignore(raw: string, path: string): ParsedDockerignore {
  const lines = raw.split('\n');
  const entries: DockerignoreEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const negation = trimmed.startsWith('!');
    const pattern = negation ? trimmed.slice(1) : trimmed;

    entries.push({
      pattern,
      negation,
      line: i + 1,
    });
  }

  return { path, entries, raw };
}

export function hasEntry(parsed: ParsedDockerignore, pattern: string): boolean {
  return parsed.entries.some(
    (e) => !e.negation && (e.pattern === pattern || e.pattern === pattern + '/'),
  );
}
