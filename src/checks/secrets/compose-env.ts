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
  id: 'secrets.compose-env',
  name: 'Plaintext Secret in Compose Environment',
  category: 'secrets',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.compose) return [];

    const results: CheckResult[] = [];

    for (const service of context.compose.services) {
      if (!service.environment) continue;

      const pairs: Array<{ key: string; value: string }> = [];

      if (Array.isArray(service.environment)) {
        // string[] format: ["KEY=value", "OTHER=val"]
        for (const entry of service.environment) {
          const eqIndex = entry.indexOf('=');
          if (eqIndex === -1) continue;
          pairs.push({
            key: entry.slice(0, eqIndex),
            value: entry.slice(eqIndex + 1),
          });
        }
      } else {
        // Record<string, string> format: { KEY: "value" }
        for (const [key, value] of Object.entries(service.environment)) {
          if (value !== null && value !== undefined) {
            pairs.push({ key, value: String(value) });
          }
        }
      }

      for (const { key, value } of pairs) {
        const isSecretKey = SECRET_PATTERNS.some((p) => p.test(key));
        if (!isSecretKey) continue;

        // Skip if value is a variable reference like ${VAR} or $VAR
        if (!value || /^\$\{?\w+\}?$/.test(value)) continue;

        // Skip empty or placeholder values
        if (/^(changeme|xxx|placeholder|your[_-])/i.test(value)) continue;

        results.push({
          id: 'secrets.compose-env',
          title: `Plaintext secret in compose environment`,
          severity: 'error',
          category: 'secrets',
          message:
            `Service "${service.name}" has \`${key}\` set to a plaintext value in the ` +
            `environment block. Compose files are often committed to version control, ` +
            `exposing secrets in the repository history. Use an \`env_file\` reference ` +
            `or Docker secrets instead of inline values.`,
          location: context.compose.path,
          fixes: [
            {
              description: 'Use env_file or variable substitution',
              type: 'manual',
              instructions:
                `Move the secret to a .env file and reference it with variable substitution:\n\n` +
                `  # In .env (not committed to git):\n` +
                `  ${key}=your-secret-value\n\n` +
                `  # In docker-compose.yml:\n` +
                `  services:\n` +
                `    ${service.name}:\n` +
                `      environment:\n` +
                `        - ${key}=\${${key}}\n\n` +
                `  # Or use env_file:\n` +
                `  services:\n` +
                `    ${service.name}:\n` +
                `      env_file:\n` +
                `        - .env\n\n` +
                `Make sure .env is in your .gitignore and .dockerignore.`,
            },
          ],
          meta: {
            serviceName: service.name,
            key,
          },
        });
      }
    }

    return results;
  },
});
