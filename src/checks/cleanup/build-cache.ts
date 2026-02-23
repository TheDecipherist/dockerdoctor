import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { getDiskUsage } from '../../docker/client.js';

const INFO_THRESHOLD_BYTES = 1024 * 1024 * 1024; // 1 GB
const WARN_THRESHOLD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

registerCheck({
  id: 'cleanup.build-cache',
  name: 'Build Cache Size',
  category: 'cleanup',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let usage;
    try {
      usage = await getDiskUsage();
    } catch {
      return [];
    }

    if (usage.buildCache > WARN_THRESHOLD_BYTES) {
      return [
        {
          id: 'cleanup.build-cache',
          title: 'Build cache exceeds 5 GB',
          severity: 'warning',
          category: 'cleanup',
          message:
            `Docker build cache is ${formatSize(usage.buildCache)}. ` +
            `Large build caches accumulate from repeated image builds and can ` +
            `consume significant disk space. Consider pruning the build cache.`,
          fixes: [
            {
              description: 'Clear build cache with docker builder prune',
              type: 'manual',
              instructions:
                'Run `docker builder prune` to remove build cache.\n' +
                'Add `-a` to remove all build cache (not just dangling):\n' +
                '  `docker builder prune -a`\n' +
                'Add `-f` to skip the confirmation prompt:\n' +
                '  `docker builder prune -a -f`\n\n' +
                'Note: Clearing build cache will make the next build slower ' +
                'as layers will need to be rebuilt from scratch.',
            },
          ],
          meta: {
            buildCacheBytes: usage.buildCache,
            buildCacheFormatted: formatSize(usage.buildCache),
          },
        },
      ];
    }

    if (usage.buildCache > INFO_THRESHOLD_BYTES) {
      return [
        {
          id: 'cleanup.build-cache',
          title: 'Build cache exceeds 1 GB',
          severity: 'info',
          category: 'cleanup',
          message:
            `Docker build cache is ${formatSize(usage.buildCache)}. ` +
            `This is not critical, but you may want to prune the cache ` +
            `periodically to reclaim disk space.`,
          fixes: [
            {
              description: 'Clear build cache with docker builder prune',
              type: 'manual',
              instructions:
                'Run `docker builder prune` to remove build cache.\n' +
                'Add `-a` to remove all build cache (not just dangling):\n' +
                '  `docker builder prune -a`\n' +
                'Add `-f` to skip the confirmation prompt:\n' +
                '  `docker builder prune -a -f`\n\n' +
                'Note: Clearing build cache will make the next build slower ' +
                'as layers will need to be rebuilt from scratch.',
            },
          ],
          meta: {
            buildCacheBytes: usage.buildCache,
            buildCacheFormatted: formatSize(usage.buildCache),
          },
        },
      ];
    }

    return [];
  },
});
