import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import type { CheckCategory, CliOptions } from '../types/index.js';
import { buildContext } from '../context.js';
import { findAllComposeFiles } from '../discovery.js';
import { getVersion } from '../version.js';
import { showContext } from '../ui/banner.js';
import { checkCommand } from './check.js';

type ScanMode = 'cwd' | 'subdirs' | 'path' | 'docker-only';

const DOCKER_FILE_NAMES = [
  'Dockerfile', 'dockerfile', 'Dockerfile.dev', 'Dockerfile.prod',
  '.dockerignore',
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'vendor']);

interface MenuOption {
  value: CheckCategory | 'all';
  label: string;
  hint?: string;
}

const checkOptions: MenuOption[] = [
  { value: 'all', label: 'Run all checks' },
  { value: 'dockerfile', label: 'Dockerfile', hint: 'Lint Dockerfile' },
  { value: 'compose', label: 'Compose', hint: 'Lint compose file' },
  { value: 'secrets', label: 'Secrets', hint: 'Scan for hardcoded secrets' },
  { value: 'lineendings', label: 'Line Endings', hint: 'Check for CRLF issues' },
  { value: 'dockerignore', label: 'Dockerignore', hint: 'Check .dockerignore' },
  { value: 'build', label: 'Build', hint: 'Diagnose build failures (needs Docker)' },
  { value: 'startup', label: 'Startup', hint: 'Diagnose startup failures (needs Docker)' },
  { value: 'network', label: 'Network', hint: 'Diagnose networking issues (needs Docker)' },
  { value: 'performance', label: 'Performance', hint: 'Diagnose performance issues (needs Docker)' },
  { value: 'image', label: 'Image', hint: 'Analyze image bloat (needs Docker)' },
  { value: 'cleanup', label: 'Cleanup', hint: 'Find reclaimable disk space (needs Docker)' },
];

/**
 * Recursively find directories containing Docker-related files.
 * Skips common non-project directories.
 */
function findDockerDirs(root: string, maxDepth = 4): string[] {
  const results: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    const hasDockerFile = entries.some((e) => DOCKER_FILE_NAMES.includes(e));
    if (hasDockerFile || findAllComposeFiles(dir).length > 0) {
      results.push(dir);
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          walk(fullPath, depth + 1);
        }
      } catch {
        // skip inaccessible
      }
    }
  }

  walk(root, 0);
  return results;
}

export async function interactiveCommand(opts: CliOptions): Promise<number> {
  p.intro(chalk.bgCyan.black(` dockerdoctor v${getVersion()} `));

  // Step 1: Ask how to scan
  const scanMode = await p.select<ScanMode>({
    message: 'How would you like to scan?',
    options: [
      {
        value: 'cwd',
        label: 'Scan current directory',
        hint: process.cwd(),
      },
      {
        value: 'subdirs',
        label: 'Scan sub directories',
        hint: 'Find Docker projects in child directories',
      },
      {
        value: 'path',
        label: 'Specify a directory path',
        hint: 'Enter a custom path to scan',
      },
      {
        value: 'docker-only',
        label: 'Docker daemon only',
        hint: 'Skip file scanning, check running containers/images',
      },
    ],
  });

  if (p.isCancel(scanMode)) {
    p.cancel('Cancelled.');
    return 0;
  }

  // Step 2: Resolve the target directory
  let scanDir = process.cwd();

  if (scanMode === 'subdirs') {
    const s = p.spinner();
    s.start('Scanning sub directories for Docker files...');
    const dirs = findDockerDirs(process.cwd());
    s.stop(`Found ${dirs.length} director${dirs.length === 1 ? 'y' : 'ies'} with Docker files`);

    if (dirs.length === 0) {
      p.log.warning('No Docker files found in any sub directory.');
      p.cancel('Nothing to check.');
      return 0;
    }

    const cwd = process.cwd();
    const dirSelection = await p.select<string>({
      message: 'Which project would you like to check?',
      options: dirs.map((dir) => {
        const rel = relative(cwd, dir);
        const exactFiles = readdirSync(dir).filter((f) => DOCKER_FILE_NAMES.includes(f));
        const composeFiles = findAllComposeFiles(dir).map((p) => basename(p));
        const dockerFiles = [...new Set([...exactFiles, ...composeFiles])];
        return {
          value: dir,
          label: rel || '.',
          hint: dockerFiles.join(', '),
        };
      }),
    });

    if (p.isCancel(dirSelection)) {
      p.cancel('Cancelled.');
      return 0;
    }

    scanDir = dirSelection;
  }

  if (scanMode === 'path') {
    const inputPath = await p.text({
      message: 'Enter the directory path:',
      placeholder: './my-project',
      validate(value) {
        if (!value.trim()) return 'Path cannot be empty';
        const resolved = resolve(value);
        if (!existsSync(resolved)) return `Directory not found: ${resolved}`;
      },
    });

    if (p.isCancel(inputPath)) {
      p.cancel('Cancelled.');
      return 0;
    }

    scanDir = resolve(inputPath);
  }

  // Step 3: Scan the target
  const s2 = p.spinner();
  s2.start(scanMode === 'docker-only'
    ? 'Checking Docker daemon...'
    : `Scanning ${scanDir} for Docker files...`);

  const context = await buildContext(scanDir, {
    dockerfilePath: opts.file,
    composePath: opts.composefile,
  });

  s2.stop('Scan complete');

  showContext({
    dockerfilePath: context.files.dockerfilePath,
    composePath: context.files.composePath,
    dockerignorePath: context.files.dockerignorePath,
    dockerAvailable: context.dockerAvailable,
  });

  // Step 4: Ask what to check
  const selection = await p.select({
    message: 'What would you like to check?',
    options: checkOptions,
  });

  if (p.isCancel(selection)) {
    p.cancel('Cancelled.');
    return 0;
  }

  const categories =
    selection === 'all' ? undefined : [selection as CheckCategory];

  return checkCommand(opts, categories, context);
}
