import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { dockerBuildContextSize } from '../../docker/exec.js';

const WARN_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100 MB
const ERROR_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500 MB

registerCheck({
  id: 'build.context-size',
  name: 'Build Context Size',
  category: 'build',
  requiresDocker: true,

  async run(context: CheckContext): Promise<CheckResult[]> {
    const sizeBytes = await dockerBuildContextSize(context.cwd);
    if (sizeBytes < 0) return [];

    const sizeMB = Math.round(sizeBytes / (1024 * 1024));

    if (sizeBytes > ERROR_THRESHOLD_BYTES) {
      return [
        {
          id: 'build.context-size',
          title: 'Build context is extremely large',
          severity: 'error',
          category: 'build',
          message:
            `The Docker build context at \`${context.cwd}\` is ${sizeMB} MB, ` +
            `which exceeds the 500 MB threshold. This will cause very slow builds ` +
            `and may exhaust disk space or memory during image creation.`,
          fixes: [
            {
              description: 'Add entries to .dockerignore to exclude unnecessary files',
              type: 'manual',
              instructions:
                'Create or update a `.dockerignore` file in the build context root. ' +
                'Common entries to add:\n' +
                '  node_modules/\n' +
                '  .git/\n' +
                '  dist/\n' +
                '  build/\n' +
                '  *.log\n' +
                '  .env*\n\n' +
                'Only include files that are actually needed inside the container.',
            },
          ],
          meta: { sizeBytes, sizeMB },
        },
      ];
    }

    if (sizeBytes > WARN_THRESHOLD_BYTES) {
      return [
        {
          id: 'build.context-size',
          title: 'Build context is large',
          severity: 'warning',
          category: 'build',
          message:
            `The Docker build context at \`${context.cwd}\` is ${sizeMB} MB, ` +
            `which exceeds the 100 MB threshold. Large build contexts slow down ` +
            `builds because the entire context is sent to the Docker daemon.`,
          fixes: [
            {
              description: 'Add entries to .dockerignore to exclude unnecessary files',
              type: 'manual',
              instructions:
                'Create or update a `.dockerignore` file in the build context root. ' +
                'Common entries to add:\n' +
                '  node_modules/\n' +
                '  .git/\n' +
                '  dist/\n' +
                '  build/\n' +
                '  *.log\n' +
                '  .env*\n\n' +
                'Only include files that are actually needed inside the container.',
            },
          ],
          meta: { sizeBytes, sizeMB },
        },
      ];
    }

    return [];
  },
});
