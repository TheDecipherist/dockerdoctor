import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers, listNetworks } from '../../docker/client.js';

registerCheck({
  id: 'network.same-network',
  name: 'Same Network Check',
  category: 'network',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    const containers = await listContainers({ all: false });
    if (containers.length < 2) return [];

    const networks = await listNetworks();

    // Group containers by compose project
    const projectMap = new Map<string, typeof containers>();
    for (const c of containers) {
      const project = c.labels['com.docker.compose.project'];
      if (!project) continue;
      const group = projectMap.get(project) ?? [];
      group.push(c);
      projectMap.set(project, group);
    }

    const results: CheckResult[] = [];

    for (const [project, members] of projectMap) {
      if (members.length < 2) continue;

      // For each pair of containers in the same project, check network overlap
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const a = members[i];
          const b = members[j];
          const sharedNetworks = a.networkNames.filter((n) => b.networkNames.includes(n));

          if (sharedNetworks.length === 0) {
            const aName = a.names[0] ?? a.id.slice(0, 12);
            const bName = b.names[0] ?? b.id.slice(0, 12);

            results.push({
              id: 'network.same-network',
              title: 'Containers in same project are on different networks',
              severity: 'warning',
              category: 'network',
              message:
                `Containers \`${aName}\` and \`${bName}\` belong to the same compose project ` +
                `\`${project}\` but do not share any Docker network. They will not be able to ` +
                `communicate with each other by container name. ` +
                `\`${aName}\` is on: ${a.networkNames.join(', ') || 'none'}. ` +
                `\`${bName}\` is on: ${b.networkNames.join(', ') || 'none'}.`,
              fixes: [
                {
                  description: 'Add both services to the same network in your compose file',
                  type: 'manual',
                  instructions:
                    'In your `docker-compose.yml`, define a shared network and assign both services to it:\n\n' +
                    '```yaml\n' +
                    'services:\n' +
                    `  ${aName}:\n` +
                    '    networks:\n' +
                    '      - shared\n' +
                    `  ${bName}:\n` +
                    '    networks:\n' +
                    '      - shared\n\n' +
                    'networks:\n' +
                    '  shared:\n' +
                    '```',
                },
              ],
              meta: { project, containerA: aName, containerB: bName },
            });
          }
        }
      }
    }

    return results;
  },
});
