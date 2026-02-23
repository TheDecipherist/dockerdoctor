import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers, inspectContainer } from '../../docker/client.js';

registerCheck({
  id: 'startup.env-var-verification',
  name: 'Environment Variable Verification',
  category: 'startup',
  requiresDocker: true,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.compose) return [];

    let runningContainers: Awaited<ReturnType<typeof listContainers>>;
    try {
      runningContainers = await listContainers({ all: false });
    } catch {
      return [];
    }

    const results: CheckResult[] = [];

    // Check each compose service that defines environment or env_file
    for (const service of context.compose.services) {
      const hasEnvConfig =
        service.environment !== undefined || service.env_file !== undefined;
      if (!hasEnvConfig) continue;

      // Try to find a running container matching this service name
      const matchingContainer = runningContainers.find((c) => {
        // Docker Compose containers are typically named <project>-<service>-<n> or <project>_<service>_<n>
        const nameMatch = c.names.some(
          (n) =>
            n.includes(service.name) ||
            n.endsWith(`-${service.name}-1`) ||
            n.endsWith(`_${service.name}_1`),
        );
        // Also check compose labels
        const labelMatch =
          c.labels['com.docker.compose.service'] === service.name;
        return nameMatch || labelMatch;
      });

      if (!matchingContainer) {
        // Service is defined in compose but no running container found
        results.push({
          id: 'startup.env-var-verification',
          title: `Service "${service.name}" is not running`,
          severity: 'warning',
          category: 'startup',
          message:
            `Service \`${service.name}\` is defined in the compose file with environment ` +
            'configuration, but no matching running container was found. ' +
            'This may indicate a startup failure caused by missing or invalid environment variables.',
          location: context.compose.path,
          fixes: [
            {
              description: 'Verify .env files exist and contain required variables',
              type: 'manual',
              instructions:
                `Check that the service \`${service.name}\` can start correctly:\n` +
                '  1. Verify any referenced .env files exist and contain the required variables\n' +
                '  2. Run `docker compose up ' +
                service.name +
                '` and check for errors\n' +
                '  3. Check logs: `docker compose logs ' +
                service.name +
                '`\n' +
                '  4. Ensure environment variable values are properly quoted in .env files',
            },
          ],
          meta: {
            serviceName: service.name,
            hasEnvironment: service.environment !== undefined,
            hasEnvFile: service.env_file !== undefined,
          },
        });
        continue;
      }

      // Container is running — inspect for empty required-looking env vars
      let inspect: Awaited<ReturnType<typeof inspectContainer>>;
      try {
        inspect = await inspectContainer(matchingContainer.id);
      } catch {
        continue;
      }

      const containerEnv = inspect.Config.Env ?? [];
      const emptyVars: string[] = [];

      for (const envEntry of containerEnv) {
        const eqIndex = envEntry.indexOf('=');
        if (eqIndex < 0) continue;
        const value = envEntry.slice(eqIndex + 1);
        const key = envEntry.slice(0, eqIndex);

        // Flag variables that look like they should have values but are empty
        // Skip common vars that can legitimately be empty
        const skipPatterns = [/^PATH$/, /^HOME$/, /^HOSTNAME$/, /^TERM$/];
        if (skipPatterns.some((p) => p.test(key))) continue;

        if (value === '' && key.length > 0) {
          emptyVars.push(key);
        }
      }

      if (emptyVars.length > 0) {
        const name =
          matchingContainer.names[0] ?? matchingContainer.id.slice(0, 12);
        results.push({
          id: 'startup.env-var-verification',
          title: `Service "${service.name}" has empty environment variables`,
          severity: 'warning',
          category: 'startup',
          message:
            `Container \`${name}\` for service \`${service.name}\` has ${emptyVars.length} ` +
            `empty environment variable(s): ${emptyVars.map((v) => '`' + v + '`').join(', ')}. ` +
            'These may be misconfigured or missing from .env files.',
          location: context.compose.path,
          fixes: [
            {
              description: 'Verify .env files contain values for all required variables',
              type: 'manual',
              instructions:
                'Check the following environment variables have correct values:\n' +
                emptyVars.map((v) => `  - ${v}`).join('\n') +
                '\n\n' +
                'Common causes:\n' +
                '  - The .env file does not exist or is not in the correct directory\n' +
                '  - Variable names in .env do not match those referenced in compose\n' +
                '  - Values are missing (e.g. `KEY=` instead of `KEY=value`)',
            },
          ],
          meta: {
            serviceName: service.name,
            containerId: matchingContainer.id,
            containerName: matchingContainer.names[0] ?? matchingContainer.id.slice(0, 12),
            emptyVars,
          },
        });
      }
    }

    return results;
  },
});
