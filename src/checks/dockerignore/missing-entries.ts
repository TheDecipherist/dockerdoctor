import * as fs from 'node:fs';
import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { hasEntry } from '../../parsers/dockerignore.js';

const RECOMMENDED_ENTRIES = [
  'node_modules',
  '.git',
  '.env',
  '.npm',
  'dist',
  'coverage',
];

registerCheck({
  id: 'dockerignore.missing-entries',
  name: 'Missing Common Entries in .dockerignore',
  category: 'dockerignore',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerignore) return [];

    const missing = RECOMMENDED_ENTRIES.filter(
      (entry) => !hasEntry(context.dockerignore!, entry),
    );

    if (missing.length === 0) return [];

    const dockerignorePath = context.dockerignore.path;

    return [
      {
        id: 'dockerignore.missing-entries',
        title: `.dockerignore is missing common entries`,
        severity: 'warning',
        category: 'dockerignore',
        message:
          `The \`.dockerignore\` file is missing the following commonly excluded ` +
          `entries: ${missing.map((e) => `\`${e}\``).join(', ')}. Including these ` +
          `in the Docker build context can slow down builds, increase image size, ` +
          `and potentially leak sensitive files (like .env) into the image.`,
        location: dockerignorePath,
        fixes: [
          {
            description: 'Append missing entries to .dockerignore',
            type: 'auto',
            async apply(): Promise<boolean> {
              try {
                const existing = fs.readFileSync(dockerignorePath, 'utf-8');
                const needsNewline = existing.length > 0 && !existing.endsWith('\n');
                const addition =
                  (needsNewline ? '\n' : '') +
                  '\n# Added by dockerdoctor\n' +
                  missing.join('\n') +
                  '\n';

                fs.appendFileSync(dockerignorePath, addition, 'utf-8');
                return true;
              } catch {
                return false;
              }
            },
          },
          {
            description: 'Add missing entries manually',
            type: 'manual',
            instructions:
              `Add the following entries to your \`.dockerignore\` file:\n\n` +
              missing.map((e) => `  ${e}`).join('\n') +
              `\n\nThese entries prevent unnecessary files from being sent to the ` +
              `Docker daemon during builds.`,
          },
        ],
        meta: {
          missingEntries: missing,
          totalRecommended: RECOMMENDED_ENTRIES.length,
        },
      },
    ];
  },
});
