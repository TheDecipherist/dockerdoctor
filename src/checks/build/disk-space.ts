import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { getDiskUsage } from '../../docker/client.js';

const WARN_THRESHOLD_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB
const ERROR_THRESHOLD_BYTES = 50 * 1024 * 1024 * 1024; // 50 GB

function bytesToGB(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

registerCheck({
  id: 'build.disk-space',
  name: 'Docker Disk Usage',
  category: 'build',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let usage: Awaited<ReturnType<typeof getDiskUsage>>;
    try {
      usage = await getDiskUsage();
    } catch {
      return [];
    }

    const totalGB = bytesToGB(usage.total);

    if (usage.total > ERROR_THRESHOLD_BYTES) {
      return [
        {
          id: 'build.disk-space',
          title: 'Docker disk usage is critically high',
          severity: 'error',
          category: 'build',
          message:
            `Docker is using ${totalGB} GB of disk space, exceeding the 50 GB threshold. ` +
            `Breakdown — images: ${bytesToGB(usage.images)} GB, containers: ${bytesToGB(usage.containers)} GB, ` +
            `volumes: ${bytesToGB(usage.volumes)} GB, build cache: ${bytesToGB(usage.buildCache)} GB. ` +
            'This may cause builds to fail due to insufficient disk space.',
          fixes: [
            {
              description: 'Prune unused Docker resources to reclaim disk space',
              type: 'manual',
              instructions:
                'Run one or more of the following commands:\n' +
                '  `docker system prune -a` — remove all unused images, containers, and networks\n' +
                '  `docker volume prune` — remove unused volumes\n' +
                '  `docker builder prune` — remove build cache\n\n' +
                'To see what is using space: `docker system df -v`',
            },
          ],
          meta: {
            totalBytes: usage.total,
            totalGB,
            imagesBytes: usage.images,
            imagesGB: bytesToGB(usage.images),
            containersBytes: usage.containers,
            containersGB: bytesToGB(usage.containers),
            volumesBytes: usage.volumes,
            volumesGB: bytesToGB(usage.volumes),
            buildCacheBytes: usage.buildCache,
            buildCacheGB: bytesToGB(usage.buildCache),
          },
        },
      ];
    }

    if (usage.total > WARN_THRESHOLD_BYTES) {
      return [
        {
          id: 'build.disk-space',
          title: 'Docker disk usage is high',
          severity: 'warning',
          category: 'build',
          message:
            `Docker is using ${totalGB} GB of disk space, exceeding the 20 GB threshold. ` +
            `Breakdown — images: ${bytesToGB(usage.images)} GB, containers: ${bytesToGB(usage.containers)} GB, ` +
            `volumes: ${bytesToGB(usage.volumes)} GB, build cache: ${bytesToGB(usage.buildCache)} GB.`,
          fixes: [
            {
              description: 'Prune unused Docker resources to reclaim disk space',
              type: 'manual',
              instructions:
                'Run one or more of the following commands:\n' +
                '  `docker system prune -a` — remove all unused images, containers, and networks\n' +
                '  `docker volume prune` — remove unused volumes\n' +
                '  `docker builder prune` — remove build cache\n\n' +
                'To see what is using space: `docker system df -v`',
            },
          ],
          meta: {
            totalBytes: usage.total,
            totalGB,
            imagesBytes: usage.images,
            imagesGB: bytesToGB(usage.images),
            containersBytes: usage.containers,
            containersGB: bytesToGB(usage.containers),
            volumesBytes: usage.volumes,
            volumesGB: bytesToGB(usage.volumes),
            buildCacheBytes: usage.buildCache,
            buildCacheGB: bytesToGB(usage.buildCache),
          },
        },
      ];
    }

    return [];
  },
});
