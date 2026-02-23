import * as fs from 'node:fs';
import * as path from 'node:path';
import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

const DEFAULT_DOCKERIGNORE = `# Version control
.git
.gitignore

# Dependencies
node_modules

# Environment files
.env
.env.*

# IDE / Editor
.vscode
.idea
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Build artifacts
dist
coverage
.nyc_output

# Docker
Dockerfile
docker-compose*.yml

# Documentation
README.md
LICENSE
CHANGELOG.md

# npm
.npm
.npmrc
`;

registerCheck({
  id: 'dockerignore.missing',
  name: 'Missing .dockerignore File',
  category: 'dockerignore',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (context.dockerignore) return [];

    const dockerignorePath = path.join(context.cwd, '.dockerignore');

    return [
      {
        id: 'dockerignore.missing',
        title: 'No .dockerignore file found',
        severity: 'warning',
        category: 'dockerignore',
        message:
          `No \`.dockerignore\` file was found in the project root. Without it, ` +
          `\`docker build\` sends the entire build context (including node_modules, ` +
          `.git, .env files, and other unnecessary files) to the Docker daemon. ` +
          `This slows down builds, increases image size, and may leak secrets. ` +
          `A .dockerignore works like .gitignore and excludes files from the build context.`,
        location: context.cwd,
        fixes: [
          {
            description: 'Create a .dockerignore file with common entries',
            type: 'auto',
            async apply(): Promise<boolean> {
              try {
                fs.writeFileSync(dockerignorePath, DEFAULT_DOCKERIGNORE, 'utf-8');
                return true;
              } catch {
                return false;
              }
            },
          },
          {
            description: 'Create .dockerignore manually',
            type: 'manual',
            instructions:
              `Create a \`.dockerignore\` file in the project root. At minimum, include:\n\n` +
              `  node_modules\n` +
              `  .git\n` +
              `  .env\n` +
              `  .env.*\n` +
              `  dist\n` +
              `  coverage\n` +
              `  .npm\n\n` +
              `This is similar to .gitignore and tells Docker which files to exclude ` +
              `from the build context.`,
          },
        ],
        meta: {
          expectedPath: dockerignorePath,
        },
      },
    ];
  },
});
