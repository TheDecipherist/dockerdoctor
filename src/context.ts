import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckContext } from './types/index.js';
import { parseDockerfile } from './parsers/dockerfile.js';
import { parseCompose } from './parsers/compose.js';
import { parseDockerignore } from './parsers/dockerignore.js';
import { findComposeFile } from './discovery.js';

const DOCKERFILE_NAMES = ['Dockerfile', 'dockerfile', 'Dockerfile.dev', 'Dockerfile.prod'];

function findFile(cwd: string, names: string[]): string | undefined {
  for (const name of names) {
    const fullPath = join(cwd, name);
    if (existsSync(fullPath)) return fullPath;
  }
  return undefined;
}

function findShellScripts(cwd: string): string[] {
  try {
    return readdirSync(cwd)
      .filter((f) => f.endsWith('.sh'))
      .map((f) => join(cwd, f));
  } catch {
    return [];
  }
}

async function probeDocker(): Promise<boolean> {
  try {
    const { execa } = await import('execa');
    const result = await execa('docker', ['info'], { timeout: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function buildContext(
  cwd: string,
  opts?: { dockerfilePath?: string; composePath?: string },
): Promise<CheckContext> {
  const dockerfilePath = opts?.dockerfilePath ?? findFile(cwd, DOCKERFILE_NAMES);
  const composePath = opts?.composePath ?? findComposeFile(cwd);
  const dockerignorePath = findFile(cwd, ['.dockerignore']);
  const gitattributesPath = findFile(cwd, ['.gitattributes']);
  const shellScripts = findShellScripts(cwd);

  const dockerAvailable = await probeDocker();

  let dockerfile;
  if (dockerfilePath) {
    try {
      const raw = readFileSync(dockerfilePath, 'utf-8');
      dockerfile = parseDockerfile(raw, dockerfilePath);
    } catch {
      // Treat unreadable file as not found
    }
  }

  let compose;
  if (composePath) {
    try {
      const raw = readFileSync(composePath, 'utf-8');
      compose = parseCompose(raw, composePath);
    } catch {
      // Treat unreadable file as not found
    }
  }

  let dockerignore;
  if (dockerignorePath) {
    try {
      const raw = readFileSync(dockerignorePath, 'utf-8');
      dockerignore = parseDockerignore(raw, dockerignorePath);
    } catch {
      // Treat unreadable file as not found
    }
  }

  return {
    cwd,
    dockerfile,
    compose,
    dockerignore,
    dockerAvailable,
    files: {
      dockerfilePath,
      composePath,
      dockerignorePath,
      gitattributesPath,
      shellScripts,
    },
  };
}
