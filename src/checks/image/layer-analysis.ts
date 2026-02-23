import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listImages } from '../../docker/client.js';
import { dockerImageHistory } from '../../docker/exec.js';

const LARGE_LAYER_BYTES = 200 * 1024 * 1024; // 200 MB

registerCheck({
  id: 'image.layer-analysis',
  name: 'Layer Analysis',
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

    // Limit to first 5 images to avoid excessive API calls
    const imagesToCheck = images.slice(0, 5);

    for (const img of imagesToCheck) {
      const imageRef =
        img.repoTags.length > 0 ? img.repoTags[0] : img.id;

      let historyResult;
      try {
        historyResult = await dockerImageHistory(imageRef);
      } catch {
        continue;
      }

      if (historyResult.exitCode !== 0) continue;

      const lines = historyResult.stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        let entry: { Size?: number | string; CreatedBy?: string };
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        // Size may be a number or a human-readable string; parse accordingly
        let sizeBytes: number;
        if (typeof entry.Size === 'number') {
          sizeBytes = entry.Size;
        } else if (typeof entry.Size === 'string') {
          // Try to parse human-readable sizes like "245MB", "1.2GB"
          const match = String(entry.Size).match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i);
          if (match) {
            const value = parseFloat(match[1]);
            const unit = (match[2] ?? 'B').toUpperCase();
            const multipliers: Record<string, number> = {
              B: 1,
              KB: 1024,
              MB: 1024 * 1024,
              GB: 1024 * 1024 * 1024,
              TB: 1024 * 1024 * 1024 * 1024,
            };
            sizeBytes = value * (multipliers[unit] ?? 1);
          } else {
            continue;
          }
        } else {
          continue;
        }

        if (sizeBytes > LARGE_LAYER_BYTES) {
          const sizeMB = Math.round(sizeBytes / (1024 * 1024));
          const createdBy = entry.CreatedBy ?? 'unknown command';

          results.push({
            id: 'image.layer-analysis',
            title: 'Large image layer detected',
            severity: 'warning',
            category: 'image',
            message:
              `Image \`${imageRef}\` has a layer of ${sizeMB} MB created by: ` +
              `\`${createdBy.slice(0, 120)}\`. Layers larger than 200 MB increase ` +
              `image size and slow down pulls. Combine RUN commands and clean up ` +
              `in the same layer to reduce size.`,
            fixes: [
              {
                description: 'Combine RUN commands and clean up in the same layer',
                type: 'manual',
                instructions:
                  'Combine multiple RUN commands into a single RUN instruction using `&&`.\n' +
                  'Clean up package manager caches in the same layer:\n' +
                  '  `RUN apt-get update && apt-get install -y pkg && rm -rf /var/lib/apt/lists/*`\n' +
                  'Remove temporary files, build artifacts, and caches before the layer is committed.',
              },
            ],
            meta: { imageRef, sizeBytes, sizeMB, createdBy },
          });
        }
      }
    }

    return results;
  },
});
