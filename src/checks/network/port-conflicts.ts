import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers } from '../../docker/client.js';

registerCheck({
  id: 'network.port-conflicts',
  name: 'Port Conflict Check',
  category: 'network',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    const containers = await listContainers({ all: false });
    if (containers.length < 2) return [];

    // Group by PublicPort
    const portMap = new Map<number, Array<{ name: string; id: string; privatePort: number; type: string }>>();

    for (const c of containers) {
      const name = c.names[0] ?? c.id.slice(0, 12);
      for (const p of c.ports) {
        if (p.PublicPort === undefined) continue;
        const entries = portMap.get(p.PublicPort) ?? [];
        entries.push({ name, id: c.id, privatePort: p.PrivatePort, type: p.Type });
        portMap.set(p.PublicPort, entries);
      }
    }

    const results: CheckResult[] = [];

    for (const [publicPort, bindings] of portMap) {
      if (bindings.length <= 1) continue;

      const containerNames = bindings.map((b) => `\`${b.name}\``).join(', ');
      const details = bindings
        .map((b) => `  - \`${b.name}\`: host port ${publicPort} → container port ${b.privatePort}/${b.type}`)
        .join('\n');

      results.push({
        id: 'network.port-conflicts',
        title: `Host port ${publicPort} bound by multiple containers`,
        severity: 'error',
        category: 'network',
        message:
          `Host port ${publicPort} is bound by multiple running containers: ${containerNames}. ` +
          `This causes port conflicts and may result in connectivity failures or one container ` +
          `failing to start.\n\n${details}`,
        fixes: [
          {
            description: 'Change port mappings to avoid conflicts',
            type: 'manual',
            instructions:
              `Update your \`docker-compose.yml\` or \`docker run\` commands so each container ` +
              `maps to a unique host port. For example, change:\n\n` +
              '```yaml\n' +
              'ports:\n' +
              `  - "${publicPort}:${bindings[0].privatePort}"\n` +
              '```\n\n' +
              'to a different host port:\n\n' +
              '```yaml\n' +
              'ports:\n' +
              `  - "${publicPort + 1}:${bindings[0].privatePort}"\n` +
              '```',
          },
        ],
        meta: { publicPort, containers: bindings.map((b) => b.name) },
      });
    }

    return results;
  },
});
