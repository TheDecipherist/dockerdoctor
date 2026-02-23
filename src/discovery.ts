import { existsSync, openSync, readSync, closeSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

/** Standard compose filenames checked by existence (fast path, no content reading). */
export const STANDARD_COMPOSE_NAMES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
];

/** Known non-compose YAML files to skip during content sniffing. */
const SNIFF_EXCLUDE = new Set([
  // CI configs
  '.gitlab-ci.yml',
  'bitbucket-pipelines.yml',
  'azure-pipelines.yml',
  'cloudbuild.yaml',
  'appveyor.yml',
  // Build/package tools
  '.pre-commit-config.yaml',
  'mkdocs.yml',
  'pubspec.yaml',
  'pnpm-lock.yaml',
  // Kubernetes
  'Chart.yaml',
  'values.yaml',
  'kustomization.yaml',
]);

const COMPOSE_SERVICES_RE = /^services\s*:/m;
const SNIFF_BYTES = 4096;

/**
 * Check whether a file looks like a Docker Compose file by reading
 * the first 4KB and looking for a top-level `services:` key.
 */
export function looksLikeComposeFile(filePath: string): boolean {
  let fd: number;
  try {
    fd = openSync(filePath, 'r');
  } catch {
    return false;
  }
  try {
    const buf = Buffer.alloc(SNIFF_BYTES);
    const bytesRead = readSync(fd, buf, 0, SNIFF_BYTES, 0);
    const head = buf.toString('utf-8', 0, bytesRead);
    return COMPOSE_SERVICES_RE.test(head);
  } catch {
    return false;
  } finally {
    closeSync(fd);
  }
}

/**
 * Find a single compose file in a directory.
 *
 * 1. Fast path: check standard names by existence (no content reading)
 * 2. Fallback: list .yml/.yaml files, exclude known non-compose, sniff content
 * 3. Returns first match (alphabetically) or undefined
 */
export function findComposeFile(dir: string): string | undefined {
  // Fast path: standard names
  for (const name of STANDARD_COMPOSE_NAMES) {
    const fullPath = join(dir, name);
    if (existsSync(fullPath)) return fullPath;
  }

  // Fallback: sniff .yml/.yaml files
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined;
  }

  const candidates = entries
    .filter((f) => {
      if (SNIFF_EXCLUDE.has(f)) return false;
      if (STANDARD_COMPOSE_NAMES.includes(f)) return false;
      const lower = f.toLowerCase();
      return lower.endsWith('.yml') || lower.endsWith('.yaml');
    })
    .sort();

  for (const name of candidates) {
    const fullPath = join(dir, name);
    if (looksLikeComposeFile(fullPath)) return fullPath;
  }

  return undefined;
}

/**
 * Find all compose files in a directory.
 * Returns standard-named files first, then sniffed files.
 */
export function findAllComposeFiles(dir: string): string[] {
  const results: string[] = [];

  // Standard names first
  for (const name of STANDARD_COMPOSE_NAMES) {
    const fullPath = join(dir, name);
    if (existsSync(fullPath)) results.push(fullPath);
  }

  // Sniff remaining .yml/.yaml files
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  const candidates = entries
    .filter((f) => {
      if (SNIFF_EXCLUDE.has(f)) return false;
      if (STANDARD_COMPOSE_NAMES.includes(f)) return false;
      const lower = f.toLowerCase();
      return lower.endsWith('.yml') || lower.endsWith('.yaml');
    })
    .sort();

  for (const name of candidates) {
    const fullPath = join(dir, name);
    if (looksLikeComposeFile(fullPath)) results.push(fullPath);
  }

  return results;
}
