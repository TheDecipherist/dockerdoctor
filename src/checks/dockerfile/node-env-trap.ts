import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'dockerfile.node-env-trap',
  name: 'NODE_ENV=production Before npm install/ci',
  category: 'dockerfile',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const stage of context.dockerfile.stages) {
      let nodeEnvLine: number | undefined;
      let nodeEnvRaw: string | undefined;

      for (const instr of stage.instructions) {
        // Detect ENV NODE_ENV=production or ENV NODE_ENV production
        if (instr.name === 'ENV') {
          const args = instr.args.trim();
          if (/\bNODE_ENV[\s=]+production\b/.test(args)) {
            nodeEnvLine = instr.lineno;
            nodeEnvRaw = instr.raw;
          }
        }

        // Detect npm install or npm ci after NODE_ENV=production
        if (instr.name === 'RUN' && nodeEnvLine !== undefined) {
          const cmd = instr.args;
          if (/\bnpm\s+(install|ci)\b/.test(cmd)) {
            results.push({
              id: 'dockerfile.node-env-trap',
              title: 'NODE_ENV=production set before npm install/ci',
              severity: 'error',
              category: 'dockerfile',
              message:
                `\`ENV NODE_ENV=production\` is set at line ${nodeEnvLine} before ` +
                `\`${instr.raw.trim()}\` at line ${instr.lineno}. When NODE_ENV is ` +
                `"production", npm skips devDependencies entirely. If your build step ` +
                `needs devDependencies (TypeScript, bundlers, test tools, etc.), the ` +
                `build will fail with missing modules. Set NODE_ENV=production AFTER ` +
                `the install and build steps.`,
              location: context.dockerfile.path,
              line: nodeEnvLine,
              fixes: [
                {
                  description: 'Move NODE_ENV=production after the install/build step',
                  type: 'manual',
                  instructions:
                    'Move the `ENV NODE_ENV=production` line to AFTER your npm install/ci ' +
                    'and build steps:\n\n' +
                    '  COPY package*.json ./\n' +
                    '  RUN npm ci\n' +
                    '  COPY . .\n' +
                    '  RUN npm run build\n' +
                    '  ENV NODE_ENV=production\n\n' +
                    'Alternatively, set NODE_ENV inline only for the runtime CMD:\n' +
                    '  CMD ["node", "dist/index.js"]\n' +
                    'and set NODE_ENV via docker run -e or docker-compose environment.',
                },
              ],
              meta: {
                nodeEnvLine,
                nodeEnvRaw,
                installLine: instr.lineno,
                installRaw: instr.raw,
                stageName: stage.name ?? stage.baseImage,
              },
            });
            // Only report once per stage
            break;
          }
        }
      }
    }

    return results;
  },
});
