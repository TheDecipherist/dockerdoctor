import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'compose.missing-healthcheck',
  name: 'Missing Healthcheck in Compose Service',
  category: 'compose',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.compose) return [];

    const results: CheckResult[] = [];

    for (const service of context.compose.services) {
      // Skip services that already have a healthcheck
      if (service.healthcheck) continue;

      // Skip helper/init containers — they typically have no ports and may use
      // profiles or have no long-running process
      const hasPorts = service.ports && service.ports.length > 0;
      const hasProfiles = Array.isArray((service as Record<string, unknown>).profiles);

      if (!hasPorts && !hasProfiles) continue;
      if (hasProfiles) continue;

      results.push({
        id: 'compose.missing-healthcheck',
        title: `Service "${service.name}" has no healthcheck`,
        severity: 'warning',
        category: 'compose',
        message:
          `Service "${service.name}" exposes ports but has no \`healthcheck\` block. ` +
          `Without a healthcheck, Docker has no way to determine if the service is ` +
          `actually healthy and serving traffic. Other services using \`depends_on\` ` +
          `with \`condition: service_healthy\` will not work, and orchestrators cannot ` +
          `perform proper rolling updates or automatic restarts of unhealthy containers.`,
        location: context.compose.path,
        fixes: [
          {
            description: 'Add a healthcheck to the service',
            type: 'manual',
            instructions:
              `Add a healthcheck block to service "${service.name}". For example:\n\n` +
              `  ${service.name}:\n` +
              `    healthcheck:\n` +
              `      test: ["CMD", "curl", "-f", "http://localhost:${service.ports?.[0]?.split(':')?.[0] ?? '3000'}/health"]\n` +
              `      interval: 30s\n` +
              `      timeout: 10s\n` +
              `      retries: 3\n` +
              `      start_period: 40s\n\n` +
              `For non-HTTP services, use a simple TCP check:\n` +
              `  test: ["CMD", "nc", "-z", "localhost", "5432"]\n\n` +
              `Or a process check:\n` +
              `  test: ["CMD", "pgrep", "-x", "nginx"]`,
          },
        ],
        meta: {
          serviceName: service.name,
          ports: service.ports,
        },
      });
    }

    return results;
  },
});
