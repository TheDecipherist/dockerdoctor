import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listImages } from '../../docker/client.js';

registerCheck({
  id: 'cleanup.dangling-images',
  name: 'Dangling Images',
  category: 'cleanup',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let danglingImages;
    try {
      danglingImages = await listImages({ dangling: true });
    } catch {
      return [];
    }

    if (danglingImages.length === 0) return [];

    const totalBytes = danglingImages.reduce((sum, img) => sum + img.size, 0);
    const totalMB = Math.round(totalBytes / (1024 * 1024));

    return [
      {
        id: 'cleanup.dangling-images',
        title: 'Dangling images found',
        severity: 'warning',
        category: 'cleanup',
        message:
          `Found ${danglingImages.length} dangling image(s) consuming ${totalMB} MB. ` +
          `Dangling images are layers not referenced by any tagged image and serve ` +
          `no purpose. They accumulate over time from repeated builds.`,
        fixes: [
          {
            description: 'Remove dangling images with docker image prune',
            type: 'manual',
            instructions:
              'Run `docker image prune` to remove all dangling images.\n' +
              'Add `-f` to skip the confirmation prompt:\n' +
              '  `docker image prune -f`\n\n' +
              'To also remove unused images (not just dangling), use:\n' +
              '  `docker image prune -a`',
          },
        ],
        meta: {
          count: danglingImages.length,
          totalBytes,
          totalMB,
        },
      },
    ];
  },
});
