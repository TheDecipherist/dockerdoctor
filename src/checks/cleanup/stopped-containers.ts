import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers } from '../../docker/client.js';

registerCheck({
  id: 'cleanup.stopped-containers',
  name: 'Stopped Containers',
  category: 'cleanup',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let containers;
    try {
      containers = await listContainers({ all: true });
    } catch {
      return [];
    }

    const stopped = containers.filter(
      (c) => c.state === 'exited' || c.state === 'dead',
    );

    if (stopped.length === 0) return [];

    const containerNames = stopped
      .slice(0, 10)
      .map((c) => c.names[0] ?? c.id.slice(0, 12))
      .join(', ');
    const suffix = stopped.length > 10 ? ` and ${stopped.length - 10} more` : '';

    return [
      {
        id: 'cleanup.stopped-containers',
        title: 'Stopped containers found',
        severity: 'info',
        category: 'cleanup',
        message:
          `Found ${stopped.length} stopped container(s): ${containerNames}${suffix}. ` +
          `Stopped containers retain their filesystem layers and configuration, ` +
          `consuming disk space. Remove them if they are no longer needed.`,
        fixes: [
          {
            description: 'Remove stopped containers with docker container prune',
            type: 'manual',
            instructions:
              'Run `docker container prune` to remove all stopped containers.\n' +
              'Add `-f` to skip the confirmation prompt:\n' +
              '  `docker container prune -f`\n\n' +
              'To remove a specific container:\n' +
              '  `docker rm <container_name_or_id>`',
          },
        ],
        meta: {
          count: stopped.length,
          containerNames: stopped.map((c) => c.names[0] ?? c.id.slice(0, 12)),
        },
      },
    ];
  },
});
