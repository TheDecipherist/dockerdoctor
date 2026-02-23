import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'dockerfile.npm-install',
  name: 'npm install Instead of npm ci',
  category: 'dockerfile',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const instr of context.dockerfile.allInstructions) {
      if (instr.name !== 'RUN') continue;

      const cmd = instr.args;

      // Match "npm install" but not "npm ci" and not "npm install <specific-package>"
      // We want to catch: npm install, npm install --production, npm install --only=prod
      // But NOT: npm install express (installing a specific package, which is intentional)
      const npmInstallMatch = cmd.match(/\bnpm\s+install\b(?!\s+\S)/);

      if (npmInstallMatch) {
        results.push({
          id: 'dockerfile.npm-install',
          title: 'Using npm install instead of npm ci',
          severity: 'warning',
          category: 'dockerfile',
          message:
            `\`npm install\` at line ${instr.lineno} should be \`npm ci\` in a Dockerfile. ` +
            `\`npm ci\` installs exact versions from package-lock.json, removes node_modules ` +
            `before installing, and is faster and more deterministic for CI/Docker builds. ` +
            `\`npm install\` may produce different dependency trees and can modify the lock file.`,
          location: context.dockerfile.path,
          line: instr.lineno,
          fixes: [
            {
              description: 'Replace npm install with npm ci',
              type: 'manual',
              instructions:
                'Change `npm install` to `npm ci` in the RUN instruction.\n\n' +
                'Before:\n' +
                '  RUN npm install\n\n' +
                'After:\n' +
                '  RUN npm ci\n\n' +
                'Make sure your package-lock.json is committed and copied into the ' +
                'image before running npm ci. If you need to install a specific ' +
                'package at build time, `npm install <package>` is acceptable.',
            },
          ],
          meta: {
            rawInstruction: instr.raw,
          },
        });
      }
    }

    return results;
  },
});
