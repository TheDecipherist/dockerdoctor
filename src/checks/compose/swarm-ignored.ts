import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

const SWARM_IGNORED_KEYS = ['restart', 'container_name', 'depends_on', 'links', 'build'] as const;

registerCheck({
  id: 'compose.swarm-ignored',
  name: 'Compose Directives Silently Ignored by Swarm',
  category: 'compose',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.compose) return [];

    const results: CheckResult[] = [];

    for (const service of context.compose.services) {
      // Only flag if deploy key is present, indicating Swarm intent
      if (!service.deploy) continue;

      const ignoredKeys = SWARM_IGNORED_KEYS.filter(
        (key) => service[key] !== undefined,
      );

      if (ignoredKeys.length === 0) continue;

      results.push({
        id: 'compose.swarm-ignored',
        title: `Service "${service.name}" uses directives that Swarm silently ignores`,
        severity: 'info',
        category: 'compose',
        message:
          `Service "${service.name}" has a \`deploy\` key (indicating Swarm mode) but also ` +
          `uses ${ignoredKeys.map((k) => `\`${k}\``).join(', ')} which ` +
          `${ignoredKeys.length === 1 ? 'is' : 'are'} silently ignored by Docker Swarm. ` +
          `Swarm uses its own restart policy via \`deploy.restart_policy\`, ignores ` +
          `container naming, and does not support build or depends_on. ` +
          `These keys will have no effect when deploying with \`docker stack deploy\`.`,
        location: context.compose.path,
        fixes: [
          {
            description: 'Remove Swarm-incompatible directives or move config to deploy',
            type: 'manual',
            instructions:
              `Remove or replace the following keys from service "${service.name}":\n\n` +
              ignoredKeys
                .map((key) => {
                  switch (key) {
                    case 'restart':
                      return `  - \`restart\`: Use \`deploy.restart_policy\` instead`;
                    case 'container_name':
                      return `  - \`container_name\`: Swarm manages container names automatically`;
                    case 'depends_on':
                      return `  - \`depends_on\`: Use healthchecks and retry logic instead`;
                    case 'links':
                      return `  - \`links\`: Use overlay networks for service discovery`;
                    case 'build':
                      return `  - \`build\`: Pre-build and push images; use \`image\` in Swarm`;
                    default:
                      return `  - \`${key}\`: Not supported in Swarm mode`;
                  }
                })
                .join('\n'),
          },
        ],
        meta: {
          serviceName: service.name,
          ignoredKeys,
        },
      });
    }

    return results;
  },
});
