import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { dockerStats } from '../../docker/exec.js';

const HIGH_USAGE_THRESHOLD = 80;

registerCheck({
  id: 'performance.resource-usage',
  name: 'Resource Usage Check',
  category: 'performance',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    const statsResult = await dockerStats();
    if (statsResult.exitCode !== 0 || !statsResult.stdout.trim()) return [];

    const results: CheckResult[] = [];
    const lines = statsResult.stdout.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      let stat: { Container: string; CPUPerc: string; MemUsage: string; MemPerc: string; Name?: string };
      try {
        stat = JSON.parse(line);
      } catch {
        continue;
      }

      const cpuPercStr = (stat.CPUPerc ?? '').replace('%', '');
      const memPercStr = (stat.MemPerc ?? '').replace('%', '');
      const cpuPerc = parseFloat(cpuPercStr);
      const memPerc = parseFloat(memPercStr);
      const containerName = stat.Name ?? stat.Container ?? 'unknown';

      const issues: string[] = [];
      if (!isNaN(cpuPerc) && cpuPerc > HIGH_USAGE_THRESHOLD) {
        issues.push(`CPU usage is ${stat.CPUPerc} (>${HIGH_USAGE_THRESHOLD}%)`);
      }
      if (!isNaN(memPerc) && memPerc > HIGH_USAGE_THRESHOLD) {
        issues.push(`Memory usage is ${stat.MemPerc} (>${HIGH_USAGE_THRESHOLD}%) — ${stat.MemUsage}`);
      }

      if (issues.length === 0) continue;

      results.push({
        id: 'performance.resource-usage',
        title: `High resource usage in container \`${containerName}\``,
        severity: 'warning',
        category: 'performance',
        message:
          `Container \`${containerName}\` is showing high resource consumption:\n` +
          issues.map((i) => `  - ${i}`).join('\n') +
          '\n\nSustained high usage may degrade host performance and other containers.',
        fixes: [
          {
            description: 'Increase resource limits or optimize the application',
            type: 'manual',
            instructions:
              'Options to address high resource usage:\n\n' +
              '1. **Set or increase resource limits** in your `docker-compose.yml`:\n' +
              '   ```yaml\n' +
              '   deploy:\n' +
              '     resources:\n' +
              '       limits:\n' +
              '         cpus: "2.0"\n' +
              '         memory: 2G\n' +
              '   ```\n\n' +
              '2. **Profile the application** to find CPU/memory hotspots.\n' +
              '3. **Scale horizontally** by running multiple replicas behind a load balancer.\n' +
              '4. **Check for memory leaks** if memory usage is continuously rising.',
          },
        ],
        meta: {
          containerName,
          cpuPercent: cpuPerc,
          memPercent: memPerc,
          memUsage: stat.MemUsage,
        },
      });
    }

    return results;
  },
});
