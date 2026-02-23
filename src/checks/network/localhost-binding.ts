import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers } from '../../docker/client.js';

registerCheck({
  id: 'network.localhost-binding',
  name: 'Localhost Binding Check',
  category: 'network',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    const containers = await listContainers({ all: false });
    if (containers.length === 0) return [];

    const results: CheckResult[] = [];

    for (const c of containers) {
      const name = c.names[0] ?? c.id.slice(0, 12);

      const localhostPorts = c.ports.filter(
        (p) => p.IP === '127.0.0.1' && p.PublicPort !== undefined,
      );

      if (localhostPorts.length === 0) continue;

      const portDetails = localhostPorts
        .map((p) => `127.0.0.1:${p.PublicPort} → ${p.PrivatePort}/${p.Type}`)
        .join(', ');

      results.push({
        id: 'network.localhost-binding',
        title: `Container bound to 127.0.0.1`,
        severity: 'warning',
        category: 'network',
        message:
          `Container \`${name}\` (${c.id.slice(0, 12)}) has ports bound to \`127.0.0.1\`: ${portDetails}. ` +
          `Ports bound to localhost are only accessible from the Docker host, not from other containers. ` +
          `If other containers need to reach this service, bind to \`0.0.0.0\` instead.`,
        fixes: [
          {
            description: 'Bind to 0.0.0.0 instead of 127.0.0.1',
            type: 'manual',
            instructions:
              'Update the port mapping in your `docker-compose.yml` or `docker run` command.\n\n' +
              'Change:\n' +
              '```yaml\n' +
              'ports:\n' +
              `  - "127.0.0.1:${localhostPorts[0].PublicPort}:${localhostPorts[0].PrivatePort}"\n` +
              '```\n\n' +
              'To:\n' +
              '```yaml\n' +
              'ports:\n' +
              `  - "0.0.0.0:${localhostPorts[0].PublicPort}:${localhostPorts[0].PrivatePort}"\n` +
              '```\n\n' +
              'Or simply omit the IP to default to `0.0.0.0`:\n' +
              '```yaml\n' +
              'ports:\n' +
              `  - "${localhostPorts[0].PublicPort}:${localhostPorts[0].PrivatePort}"\n` +
              '```\n\n' +
              '**Note:** Binding to `0.0.0.0` exposes the port on all network interfaces. ' +
              'If you only want localhost access from the host, keep the `127.0.0.1` binding ' +
              'and use Docker networks for inter-container communication.',
          },
        ],
        meta: { containerId: c.id, containerName: name, localhostPorts: localhostPorts.map((p) => p.PublicPort) },
      });
    }

    return results;
  },
});
