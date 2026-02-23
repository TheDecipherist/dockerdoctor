import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listImages } from '../../docker/client.js';

const WARN_THRESHOLD_BYTES = 1024 * 1024 * 1024; // 1 GB
const ERROR_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

registerCheck({
  id: 'image.image-size',
  name: 'Image Size',
  category: 'image',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let images;
    try {
      images = await listImages();
    } catch {
      return [];
    }

    const results: CheckResult[] = [];

    for (const img of images) {
      const sizeMB = Math.round(img.size / (1024 * 1024));
      const imageName =
        img.repoTags.length > 0 ? img.repoTags[0] : img.id.slice(0, 12);

      if (img.size > ERROR_THRESHOLD_BYTES) {
        results.push({
          id: 'image.image-size',
          title: 'Image exceeds 2 GB',
          severity: 'error',
          category: 'image',
          message:
            `Image \`${imageName}\` is ${sizeMB} MB. Images larger than 2 GB ` +
            `significantly increase pull times, disk usage, and deployment latency. ` +
            `Consider using multi-stage builds and slimmer base images.`,
          fixes: [
            {
              description: 'Reduce image size with multi-stage builds and slim base images',
              type: 'manual',
              instructions:
                'Use multi-stage builds to separate build dependencies from the runtime image.\n' +
                'Switch to slim or alpine base images (e.g., `node:20-alpine` instead of `node:20`).\n' +
                'Remove unnecessary files and package caches in the same RUN layer.',
            },
          ],
          meta: { imageName, sizeBytes: img.size, sizeMB },
        });
      } else if (img.size > WARN_THRESHOLD_BYTES) {
        results.push({
          id: 'image.image-size',
          title: 'Image exceeds 1 GB',
          severity: 'warning',
          category: 'image',
          message:
            `Image \`${imageName}\` is ${sizeMB} MB. Large images slow down pulls ` +
            `and increase storage costs. Consider optimizing with multi-stage builds ` +
            `or smaller base images.`,
          fixes: [
            {
              description: 'Reduce image size with multi-stage builds and slim base images',
              type: 'manual',
              instructions:
                'Use multi-stage builds to separate build dependencies from the runtime image.\n' +
                'Switch to slim or alpine base images (e.g., `node:20-alpine` instead of `node:20`).\n' +
                'Remove unnecessary files and package caches in the same RUN layer.',
            },
          ],
          meta: { imageName, sizeBytes: img.size, sizeMB },
        });
      }
    }

    return results;
  },
});
