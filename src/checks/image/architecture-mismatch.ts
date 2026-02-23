import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listImages } from '../../docker/client.js';
import { dockerExec, dockerInspect } from '../../docker/exec.js';

registerCheck({
  id: 'image.architecture-mismatch',
  name: 'Architecture Mismatch',
  category: 'image',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    // Get host architecture
    let hostArch: string;
    try {
      const versionResult = await dockerExec(['version', '--format', '{{.Server.Arch}}']);
      if (versionResult.exitCode !== 0 || !versionResult.stdout.trim()) return [];
      hostArch = versionResult.stdout.trim();
    } catch {
      return [];
    }

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
      let inspectResult;
      try {
        inspectResult = await dockerInspect(img.id);
      } catch {
        continue;
      }

      if (inspectResult.exitCode !== 0) continue;

      let inspectData: Array<{ Architecture?: string }>;
      try {
        inspectData = JSON.parse(inspectResult.stdout);
      } catch {
        continue;
      }

      if (!Array.isArray(inspectData) || inspectData.length === 0) continue;

      const imageArch = inspectData[0].Architecture;
      if (!imageArch) continue;

      if (imageArch !== hostArch) {
        const imageName =
          img.repoTags.length > 0 ? img.repoTags[0] : img.id.slice(0, 12);

        results.push({
          id: 'image.architecture-mismatch',
          title: 'Image architecture does not match host',
          severity: 'warning',
          category: 'image',
          message:
            `Image \`${imageName}\` is built for \`${imageArch}\` but the Docker host ` +
            `architecture is \`${hostArch}\`. Running images under emulation is significantly ` +
            `slower and may cause compatibility issues.`,
          fixes: [
            {
              description: 'Rebuild the image for the target architecture',
              type: 'manual',
              instructions:
                `Rebuild the image for the host architecture (\`${hostArch}\`) using:\n` +
                `  \`docker buildx build --platform linux/${hostArch} -t <image> .\`\n\n` +
                'Alternatively, use `docker buildx` to create multi-platform images:\n' +
                '  `docker buildx build --platform linux/amd64,linux/arm64 -t <image> .`',
            },
          ],
          meta: { imageName, imageArch, hostArch },
        });
      }
    }

    return results;
  },
});
