import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'compose.bridge-network',
  name: 'Bridge Network Driver (Incompatible with Swarm)',
  category: 'compose',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.compose) return [];

    const results: CheckResult[] = [];

    for (const [netName, netConfig] of Object.entries(context.compose.networks)) {
      if (!netConfig || typeof netConfig !== 'object') continue;

      const driver = (netConfig as Record<string, unknown>).driver;

      if (driver === 'bridge') {
        results.push({
          id: 'compose.bridge-network',
          title: `Network "${netName}" uses bridge driver`,
          severity: 'info',
          category: 'compose',
          message:
            `Network "${netName}" is configured with \`driver: bridge\`. The bridge ` +
            `driver only works on a single Docker host and will not function in Docker ` +
            `Swarm mode, which requires the \`overlay\` driver for cross-node communication. ` +
            `If you plan to deploy with \`docker stack deploy\`, this network will not ` +
            `connect services running on different nodes.`,
          location: context.compose.path,
          fixes: [
            {
              description: 'Switch to overlay driver for Swarm compatibility',
              type: 'manual',
              instructions:
                `Change the network driver from \`bridge\` to \`overlay\`:\n\n` +
                `  networks:\n` +
                `    ${netName}:\n` +
                `      driver: overlay\n\n` +
                `If you are not using Swarm and only run on a single host, \`bridge\` ` +
                `is fine and this message can be ignored.`,
            },
          ],
          meta: {
            networkName: netName,
            driver,
          },
        });
      }
    }

    return results;
  },
});
