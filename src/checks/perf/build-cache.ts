import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { getDiskUsage } from '../../docker/client.js';

const CACHE_THRESHOLD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

registerCheck({
  id: 'performance.build-cache',
  name: 'Build Cache Size Check',
  category: 'performance',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let diskUsage;
    try {
      diskUsage = await getDiskUsage();
    } catch {
      return [];
    }

    const cacheBytes = diskUsage.buildCache;
    if (cacheBytes <= CACHE_THRESHOLD_BYTES) return [];

    const cacheGB = (cacheBytes / (1024 * 1024 * 1024)).toFixed(2);

    return [
      {
        id: 'performance.build-cache',
        title: 'Docker build cache is large',
        severity: 'info',
        category: 'performance',
        message:
          `The Docker build cache is using ${cacheGB} GB of disk space, which exceeds ` +
          `the 5 GB threshold. A large build cache consumes disk space and can slow down ` +
          `Docker operations. Consider pruning unused build cache to free space.`,
        fixes: [
          {
            description: 'Prune the Docker build cache',
            type: 'manual',
            instructions:
              'Run the following command to remove unused build cache:\n\n' +
              '```bash\n' +
              'docker builder prune\n' +
              '```\n\n' +
              'To remove all build cache (including currently used layers):\n\n' +
              '```bash\n' +
              'docker builder prune --all\n' +
              '```\n\n' +
              'To remove cache older than 24 hours:\n\n' +
              '```bash\n' +
              'docker builder prune --filter "until=24h"\n' +
              '```\n\n' +
              'You can also add `--force` to skip the confirmation prompt.',
          },
        ],
        meta: { buildCacheBytes: cacheBytes, buildCacheGB: parseFloat(cacheGB) },
      },
    ];
  },
});
