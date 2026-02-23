import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'compose.bind-mounts',
  name: 'Bind Mounts in Compose (Swarm Incompatible)',
  category: 'compose',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.compose) return [];

    const results: CheckResult[] = [];

    for (const service of context.compose.services) {
      if (!service.volumes || service.volumes.length === 0) continue;

      const bindMounts: string[] = [];

      for (const vol of service.volumes) {
        // Bind mounts use host:container syntax with a path (starts with / or ./)
        // Named volumes are just "name:/container/path"
        if (typeof vol !== 'string') continue;

        const parts = vol.split(':');
        if (parts.length < 2) continue;

        const hostPart = parts[0];

        // Host path bind mounts start with /, ./, or ../ (or Windows paths like C:\)
        if (
          hostPart.startsWith('/') ||
          hostPart.startsWith('./') ||
          hostPart.startsWith('../') ||
          hostPart === '.' ||
          hostPart === '..'
        ) {
          bindMounts.push(vol);
        }
      }

      if (bindMounts.length === 0) continue;

      results.push({
        id: 'compose.bind-mounts',
        title: `Service "${service.name}" uses bind mounts`,
        severity: 'info',
        category: 'compose',
        message:
          `Service "${service.name}" uses host path bind mount${bindMounts.length > 1 ? 's' : ''}: ` +
          `${bindMounts.map((b) => `\`${b}\``).join(', ')}. ` +
          `Bind mounts reference paths on the Docker host filesystem. In a multi-node ` +
          `Swarm cluster, the same directory may not exist on every node, causing ` +
          `containers to fail when scheduled on nodes without the expected path. ` +
          `Use named volumes with a volume driver (e.g., NFS, cloud storage) for ` +
          `data that must be shared across nodes.`,
        location: context.compose.path,
        fixes: [
          {
            description: 'Replace bind mounts with named volumes',
            type: 'manual',
            instructions:
              `Replace host path bind mounts with named volumes:\n\n` +
              `  Before:\n` +
              `    volumes:\n` +
              bindMounts.map((b) => `      - ${b}`).join('\n') +
              `\n\n` +
              `  After:\n` +
              `    volumes:\n` +
              `      - app-data:/container/path\n\n` +
              `  # Top-level volumes section:\n` +
              `  volumes:\n` +
              `    app-data:\n` +
              `      driver: local  # or nfs, etc.\n\n` +
              `For development bind mounts, consider using a separate ` +
              `docker-compose.override.yml that is not deployed to Swarm.`,
          },
        ],
        meta: {
          serviceName: service.name,
          bindMounts,
        },
      });
    }

    return results;
  },
});
