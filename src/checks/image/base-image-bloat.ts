import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listImages } from '../../docker/client.js';

const BLOAT_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500 MB

// Known base image prefixes that have slim/alpine alternatives
const KNOWN_BASE_PATTERNS = [
  'node', 'python', 'ruby', 'golang', 'java', 'openjdk', 'php',
  'ubuntu', 'debian', 'centos', 'fedora', 'amazonlinux',
  'dotnet', 'rust', 'perl', 'elixir', 'erlang',
];

registerCheck({
  id: 'image.base-image-bloat',
  name: 'Base Image Bloat',
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
      if (img.size <= BLOAT_THRESHOLD_BYTES) continue;
      if (img.repoTags.length === 0) continue;

      for (const tag of img.repoTags) {
        if (tag === '<none>:<none>') continue;

        const lowerTag = tag.toLowerCase();

        // Check if tag already uses slim or alpine
        if (lowerTag.includes('slim') || lowerTag.includes('alpine')) continue;

        // Check if this looks like a known base image
        const isKnownBase = KNOWN_BASE_PATTERNS.some((pattern) => {
          const tagName = lowerTag.split(':')[0].split('/').pop() ?? '';
          return tagName === pattern || tagName.startsWith(`${pattern}-`);
        });

        // Also flag images using :latest or simple version tags without slim/alpine
        const tagPart = tag.split(':')[1] ?? 'latest';
        const isGenericTag =
          tagPart === 'latest' ||
          /^\d+(\.\d+)*$/.test(tagPart); // e.g., "20", "3.12", "22.04"

        if (isKnownBase || isGenericTag) {
          const sizeMB = Math.round(img.size / (1024 * 1024));
          const imageName = tag.split(':')[0].split('/').pop() ?? tag;

          results.push({
            id: 'image.base-image-bloat',
            title: 'Potentially bloated base image',
            severity: 'info',
            category: 'image',
            message:
              `Image \`${tag}\` is ${sizeMB} MB and does not appear to use a slim ` +
              `or alpine variant. Switching to a \`${imageName}-slim\` or ` +
              `\`${imageName}-alpine\` base image could significantly reduce image size.`,
            fixes: [
              {
                description: 'Switch to a slim or alpine base image variant',
                type: 'manual',
                instructions:
                  `Replace the base image in your Dockerfile with a slimmer variant:\n` +
                  `  Instead of: \`FROM ${tag}\`\n` +
                  `  Use: \`FROM ${tag.replace(/:(.+)$/, ':$1-slim')}\` or \`FROM ${tag.replace(/:(.+)$/, ':$1-alpine')}\`\n\n` +
                  'Alpine images are the smallest but may have compatibility issues with some packages.\n' +
                  'Slim images offer a good balance between size and compatibility.',
              },
            ],
            meta: { tag, sizeMB, sizeBytes: img.size },
          });
          // Only report once per image (not per tag)
          break;
        }
      }
    }

    return results;
  },
});
