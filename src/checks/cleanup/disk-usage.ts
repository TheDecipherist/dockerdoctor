import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { getDiskUsage } from '../../docker/client.js';

const WARN_THRESHOLD_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const ERROR_THRESHOLD_BYTES = 30 * 1024 * 1024 * 1024; // 30 GB

function formatMB(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

registerCheck({
  id: 'cleanup.disk-usage',
  name: 'Docker Disk Usage',
  category: 'cleanup',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let usage;
    try {
      usage = await getDiskUsage();
    } catch {
      return [];
    }

    const breakdown =
      `Images: ${formatMB(usage.images)}, ` +
      `Containers: ${formatMB(usage.containers)}, ` +
      `Volumes: ${formatMB(usage.volumes)}, ` +
      `Build Cache: ${formatMB(usage.buildCache)}`;

    if (usage.total > ERROR_THRESHOLD_BYTES) {
      return [
        {
          id: 'cleanup.disk-usage',
          title: 'Docker disk usage exceeds 30 GB',
          severity: 'error',
          category: 'cleanup',
          message:
            `Total Docker disk usage is ${formatMB(usage.total)}. ` +
            `Breakdown: ${breakdown}. ` +
            `This level of disk consumption may cause out-of-space errors ` +
            `and degrade system performance.`,
          fixes: [
            {
              description: 'Reclaim disk space with docker system prune',
              type: 'manual',
              instructions:
                'Run `docker system prune -a` to remove all unused images, containers, ' +
                'networks, and build cache.\n' +
                'Add `--volumes` to also remove unused volumes:\n' +
                '  `docker system prune -a --volumes`\n\n' +
                'WARNING: This will remove all stopped containers, unused images, ' +
                'and optionally all unused volumes. Verify nothing important will be lost.',
            },
          ],
          meta: {
            totalBytes: usage.total,
            imagesBytes: usage.images,
            containersBytes: usage.containers,
            volumesBytes: usage.volumes,
            buildCacheBytes: usage.buildCache,
          },
        },
      ];
    }

    if (usage.total > WARN_THRESHOLD_BYTES) {
      return [
        {
          id: 'cleanup.disk-usage',
          title: 'Docker disk usage exceeds 10 GB',
          severity: 'warning',
          category: 'cleanup',
          message:
            `Total Docker disk usage is ${formatMB(usage.total)}. ` +
            `Breakdown: ${breakdown}. ` +
            `Consider cleaning up unused resources to free disk space.`,
          fixes: [
            {
              description: 'Reclaim disk space with docker system prune',
              type: 'manual',
              instructions:
                'Run `docker system prune -a` to remove all unused images, containers, ' +
                'networks, and build cache.\n' +
                'Add `--volumes` to also remove unused volumes:\n' +
                '  `docker system prune -a --volumes`\n\n' +
                'WARNING: This will remove all stopped containers, unused images, ' +
                'and optionally all unused volumes. Verify nothing important will be lost.',
            },
          ],
          meta: {
            totalBytes: usage.total,
            imagesBytes: usage.images,
            containersBytes: usage.containers,
            volumesBytes: usage.volumes,
            buildCacheBytes: usage.buildCache,
          },
        },
      ];
    }

    return [];
  },
});
