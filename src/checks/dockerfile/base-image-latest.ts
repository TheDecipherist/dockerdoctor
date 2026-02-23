import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'dockerfile.base-image-latest',
  name: 'Base Image Uses :latest or No Tag',
  category: 'dockerfile',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const stage of context.dockerfile.stages) {
      const baseImage = stage.baseImage;

      // Skip scratch — it has no tag
      if (baseImage === 'scratch') continue;

      // Skip ARG-based images like FROM ${BASE_IMAGE} — we cannot resolve them statically
      if (/\$\{?[A-Z_]+\}?/.test(baseImage)) continue;

      // Check for :latest or no tag at all
      const hasTag = baseImage.includes(':');
      const usesLatest = baseImage.endsWith(':latest');

      if (!hasTag || usesLatest) {
        const issue = usesLatest ? 'uses the `:latest` tag' : 'has no tag (implicitly `:latest`)';

        results.push({
          id: 'dockerfile.base-image-latest',
          title: `Base image ${issue}`,
          severity: 'warning',
          category: 'dockerfile',
          message:
            `\`FROM ${baseImage}\` at line ${stage.startLine} ${issue}. ` +
            `The \`:latest\` tag is mutable and can change at any time, leading to ` +
            `unreproducible builds. A build that works today may break tomorrow when ` +
            `the upstream image is updated. Pin to a specific version tag or digest.`,
          location: context.dockerfile.path,
          line: stage.startLine,
          fixes: [
            {
              description: 'Pin the base image to a specific version',
              type: 'manual',
              instructions:
                `Replace \`FROM ${baseImage}\` with a pinned version. For example:\n\n` +
                `  FROM node:20-slim\n` +
                `  FROM python:3.12-slim\n` +
                `  FROM nginx:1.25-alpine\n\n` +
                `For maximum reproducibility, pin to a digest:\n` +
                `  FROM node:20-slim@sha256:abc123...\n\n` +
                `You can find available tags on Docker Hub or by running:\n` +
                `  docker pull --quiet ${baseImage.split(':')[0]} && docker inspect ${baseImage.split(':')[0]}`,
            },
          ],
          meta: {
            baseImage,
            stageName: stage.name,
            startLine: stage.startLine,
          },
        });
      }
    }

    return results;
  },
});
