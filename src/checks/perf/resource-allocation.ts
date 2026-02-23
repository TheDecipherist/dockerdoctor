import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers, inspectContainer } from '../../docker/client.js';

registerCheck({
  id: 'performance.resource-allocation',
  name: 'Resource Allocation Check',
  category: 'performance',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    const containers = await listContainers({ all: false });
    if (containers.length === 0) return [];

    const results: CheckResult[] = [];

    for (const c of containers) {
      const name = c.names[0] ?? c.id.slice(0, 12);
      let info;
      try {
        info = await inspectContainer(c.id);
      } catch {
        continue;
      }

      const hostConfig = info.HostConfig ?? {};
      const memoryLimit = (hostConfig as { Memory?: number }).Memory ?? 0;
      const nanoCpus = (hostConfig as { NanoCpus?: number }).NanoCpus ?? 0;

      const noMemoryLimit = memoryLimit === 0;
      const noCpuLimit = nanoCpus === 0;

      if (!noMemoryLimit || !noCpuLimit) continue;

      const missingLimits: string[] = [];
      if (noMemoryLimit) missingLimits.push('memory');
      if (noCpuLimit) missingLimits.push('CPU');

      results.push({
        id: 'performance.resource-allocation',
        title: `No resource limits on container \`${name}\``,
        severity: 'info',
        category: 'performance',
        message:
          `Container \`${name}\` (${c.id.slice(0, 12)}) is running without ${missingLimits.join(' or ')} limits. ` +
          `Containers without resource limits can consume all available host resources, potentially ` +
          `starving other containers and system processes.`,
        fixes: [
          {
            description: 'Set memory and CPU limits',
            type: 'manual',
            instructions:
              'Add resource limits in your `docker-compose.yml`:\n\n' +
              '```yaml\n' +
              'services:\n' +
              `  ${name}:\n` +
              '    deploy:\n' +
              '      resources:\n' +
              '        limits:\n' +
              '          cpus: "1.0"\n' +
              '          memory: 512M\n' +
              '        reservations:\n' +
              '          cpus: "0.25"\n' +
              '          memory: 128M\n' +
              '```\n\n' +
              'Or with `docker run` flags:\n\n' +
              '```bash\n' +
              `docker run --memory=512m --cpus=1.0 ${c.image}\n` +
              '```\n\n' +
              'Adjust the values based on your application\'s requirements. Start with conservative ' +
              'limits and increase if the application needs more resources.',
          },
        ],
        meta: {
          containerId: c.id,
          containerName: name,
          memoryLimit,
          nanoCpus,
          noMemoryLimit,
          noCpuLimit,
        },
      });
    }

    return results;
  },
});
