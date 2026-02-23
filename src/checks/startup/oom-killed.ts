import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers, inspectContainer } from '../../docker/client.js';

registerCheck({
  id: 'startup.oom-killed',
  name: 'OOM Killed Container Detection',
  category: 'startup',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let containers: Awaited<ReturnType<typeof listContainers>>;
    try {
      containers = await listContainers({ all: true });
    } catch {
      return [];
    }

    const exited = containers.filter((c) => c.state === 'exited');
    if (exited.length === 0) return [];

    const results: CheckResult[] = [];

    for (const container of exited) {
      let inspect: Awaited<ReturnType<typeof inspectContainer>>;
      try {
        inspect = await inspectContainer(container.id);
      } catch {
        continue;
      }

      if (inspect.State.OOMKilled !== true) continue;

      const name = container.names[0] ?? container.id.slice(0, 12);
      const memoryLimit = inspect.HostConfig?.Memory ?? 0;
      const memoryLimitMB =
        memoryLimit > 0 ? Math.round(memoryLimit / (1024 * 1024)) : 0;

      results.push({
        id: 'startup.oom-killed',
        title: `Container "${name}" was OOM killed`,
        severity: 'error',
        category: 'startup',
        message:
          `Container \`${name}\` (image: \`${container.image}\`) was killed by the ` +
          'Out-Of-Memory (OOM) killer because it exceeded its memory limit.' +
          (memoryLimitMB > 0
            ? ` Current memory limit: ${memoryLimitMB} MB.`
            : ' No explicit memory limit was set; the container exhausted host memory.'),
        fixes: [
          {
            description: 'Increase memory limit or optimize application memory usage',
            type: 'manual',
            instructions:
              'To increase the memory limit:\n' +
              '  - Docker Compose: add `deploy.resources.limits.memory: 512m` to the service\n' +
              '  - Docker run: use `--memory=512m` flag\n\n' +
              'To diagnose the issue:\n' +
              `  - Check logs: \`docker logs ${name}\`\n` +
              '  - Monitor memory usage: `docker stats`\n' +
              '  - Profile the application for memory leaks\n\n' +
              'If using Node.js, consider setting `--max-old-space-size` to limit heap usage.',
          },
        ],
        meta: {
          containerId: container.id,
          containerName: name,
          image: container.image,
          oomKilled: true,
          memoryLimitBytes: memoryLimit,
          memoryLimitMB,
        },
      });
    }

    return results;
  },
});
