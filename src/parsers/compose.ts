import { parse as parseYaml } from 'yaml';
import type { ParsedCompose, ComposeService } from '../types/index.js';

export function parseCompose(raw: string, path: string): ParsedCompose {
  const doc = parseYaml(raw) as Record<string, unknown> | null;

  if (!doc || typeof doc !== 'object') {
    return { path, services: [], networks: {}, volumes: {}, raw };
  }

  const servicesRaw = (doc.services ?? {}) as Record<string, Record<string, unknown>>;
  const services: ComposeService[] = Object.entries(servicesRaw).map(([name, config]) => ({
    name,
    ...config,
  })) as ComposeService[];

  return {
    path,
    version: doc.version as string | undefined,
    services,
    networks: (doc.networks ?? {}) as Record<string, unknown>,
    volumes: (doc.volumes ?? {}) as Record<string, unknown>,
    raw,
  };
}
