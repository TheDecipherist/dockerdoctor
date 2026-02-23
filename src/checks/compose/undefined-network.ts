import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'compose.undefined-network',
  name: 'Undefined Network Reference',
  category: 'compose',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.compose) return [];

    const definedNetworks = context.compose.networks;
    // If there's no top-level networks block at all, Docker creates all referenced
    // networks automatically — nothing to flag
    if (!definedNetworks || Object.keys(definedNetworks).length === 0) return [];

    const definedSet = new Set(Object.keys(definedNetworks));
    const results: CheckResult[] = [];

    for (const service of context.compose.services) {
      const networks = service.networks;
      if (!networks) continue;

      const netNames = Array.isArray(networks) ? networks : Object.keys(networks);

      for (const netName of netNames) {
        if (!definedSet.has(netName)) {
          results.push({
            id: 'compose.undefined-network',
            title: `Service "${service.name}" references undefined network "${netName}"`,
            severity: 'error',
            category: 'compose',
            message:
              `Service "${service.name}" references network "${netName}", but it is not defined ` +
              `in the top-level "networks:" block. Docker Compose will fail to start with ` +
              `"network ${netName} is declared as external, but could not be found". ` +
              `Add "${netName}" to the top-level networks section.`,
            location: context.compose.path,
            fixes: [
              {
                description: `Define the "${netName}" network in the top-level networks block`,
                type: 'manual',
                instructions:
                  `Add "${netName}" to the top-level networks section:\n\n` +
                  `  # Add to docker-compose.yml\n` +
                  `  networks:\n` +
                  `    ${netName}:\n` +
                  `      driver: bridge`,
              },
            ],
            meta: {
              serviceName: service.name,
              networkName: netName,
              definedNetworks: [...definedSet],
            },
          });
        }
      }
    }

    return results;
  },
});
