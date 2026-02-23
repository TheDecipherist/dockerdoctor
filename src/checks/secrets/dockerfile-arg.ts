import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

const SECRET_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /api[_-]?key/i,
  /apikey/i,
  /token/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
];

registerCheck({
  id: 'secrets.dockerfile-arg',
  name: 'Hardcoded Secret in Dockerfile ARG Default',
  category: 'secrets',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const instr of context.dockerfile.allInstructions) {
      if (instr.name !== 'ARG') continue;

      const args = instr.args.trim();

      // ARG KEY=default_value
      const eqIndex = args.indexOf('=');
      if (eqIndex === -1) continue; // No default value

      const key = args.slice(0, eqIndex).trim();
      let value = args.slice(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      const isSecretKey = SECRET_PATTERNS.some((p) => p.test(key));
      if (!isSecretKey) continue;

      // Skip empty defaults
      if (!value) continue;

      // Skip variable references
      if (/^\$\{?\w+\}?$/.test(value)) continue;

      results.push({
        id: 'secrets.dockerfile-arg',
        title: `Hardcoded secret in ARG default value`,
        severity: 'error',
        category: 'secrets',
        message:
          `ARG instruction at line ${instr.lineno} defines \`${key}\` with a hardcoded ` +
          `default value. Although ARG values are not persisted in the final image layers ` +
          `like ENV, they are still visible in the image build history via ` +
          `\`docker history\`. Anyone with access to the image can extract ARG values. ` +
          `Never use ARG for secrets — use \`--mount=type=secret\` instead.`,
        location: context.dockerfile?.path,
        line: instr.lineno,
        fixes: [
          {
            description: 'Remove hardcoded default and use build secrets',
            type: 'manual',
            instructions:
              `Remove the default value from the ARG instruction:\n\n` +
              `  # Instead of:\n` +
              `  ARG ${key}=${value}\n\n` +
              `  # Use ARG without default (must be passed at build time):\n` +
              `  ARG ${key}\n\n` +
              `  # Or better, use BuildKit secrets (Docker 18.09+):\n` +
              `  RUN --mount=type=secret,id=${key.toLowerCase()} \\\n` +
              `      export ${key}=$(cat /run/secrets/${key.toLowerCase()}) && \\\n` +
              `      # use the secret here\n\n` +
              `  # Build with:\n` +
              `  docker build --secret id=${key.toLowerCase()},src=./${key.toLowerCase()}.txt .`,
          },
        ],
        meta: {
          key,
          lineNumber: instr.lineno,
        },
      });
    }

    return results;
  },
});
