import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { normalizeArgs } from '../utils.js';

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
  id: 'secrets.dockerfile-env',
  name: 'Hardcoded Secret in Dockerfile ENV',
  category: 'secrets',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const instr of context.dockerfile.allInstructions) {
      if (instr.name !== 'ENV') continue;

      const args = normalizeArgs(instr.args);

      // ENV can be "KEY=value" or "KEY value" or multi-key "KEY1=val1 KEY2=val2"
      // Parse all KEY=value pairs
      const pairs: Array<{ key: string; value: string }> = [];

      // Match KEY=value patterns (value may be quoted)
      const kvRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S*))/g;
      let match: RegExpExecArray | null;

      while ((match = kvRegex.exec(args)) !== null) {
        const key = match[1];
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        pairs.push({ key, value });
      }

      // Also handle "ENV KEY value" (single key, space-separated)
      if (pairs.length === 0) {
        const spaceMatch = args.match(/^(\w+)\s+(.+)$/);
        if (spaceMatch) {
          pairs.push({ key: spaceMatch[1], value: spaceMatch[2].trim() });
        }
      }

      for (const { key, value } of pairs) {
        const isSecretKey = SECRET_PATTERNS.some((p) => p.test(key));
        if (!isSecretKey) continue;

        // Skip if value is a variable reference like $VAR or ${VAR}
        if (!value || /^\$\{?\w+\}?$/.test(value)) continue;

        // Skip if value is a placeholder
        if (/^(changeme|xxx|placeholder|your[_-])/i.test(value)) continue;

        results.push({
          id: 'secrets.dockerfile-env',
          title: `Hardcoded secret in ENV instruction`,
          severity: 'error',
          category: 'secrets',
          message:
            `ENV instruction at line ${instr.lineno} sets \`${key}\` to a hardcoded value. ` +
            `Secrets baked into ENV instructions are visible in the image metadata via ` +
            `\`docker inspect\` and in every layer of the image history. Anyone who pulls ` +
            `the image can extract them. Use build-time secrets (\`--mount=type=secret\`) ` +
            `or runtime environment variables instead.`,
          location: context.dockerfile?.path,
          line: instr.lineno,
          fixes: [
            {
              description: 'Use runtime environment variables or Docker secrets',
              type: 'manual',
              instructions:
                `Remove the hardcoded value from the Dockerfile and pass it at runtime:\n\n` +
                `  # Remove from Dockerfile:\n` +
                `  # ENV ${key}=${value}\n\n` +
                `  # Pass at runtime instead:\n` +
                `  docker run -e ${key}=<value> myimage\n\n` +
                `  # Or use Docker Compose:\n` +
                `  environment:\n` +
                `    - ${key}=\${${key}}  # reads from .env file\n\n` +
                `For build-time secrets (Docker 18.09+):\n` +
                `  RUN --mount=type=secret,id=${key.toLowerCase()} cat /run/secrets/${key.toLowerCase()}`,
            },
          ],
          meta: {
            key,
            lineNumber: instr.lineno,
          },
        });
      }
    }

    return results;
  },
});
