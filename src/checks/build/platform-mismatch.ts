import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { dockerExec } from '../../docker/exec.js';

registerCheck({
  id: 'build.platform-mismatch',
  name: 'Platform Mismatch Detection',
  category: 'build',
  requiresDocker: true,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    // Get the host Docker architecture
    const versionResult = await dockerExec(['version', '--format', '{{.Server.Arch}}']);
    if (versionResult.exitCode !== 0) return [];

    const hostArch = versionResult.stdout.trim(); // e.g. "amd64", "arm64"
    if (!hostArch) return [];

    const results: CheckResult[] = [];

    // Map Docker arch names to platform strings used in FROM --platform=
    const archAliases: Record<string, string[]> = {
      amd64: ['linux/amd64', 'amd64'],
      arm64: ['linux/arm64', 'linux/arm64/v8', 'arm64'],
      arm: ['linux/arm', 'linux/arm/v7', 'linux/arm/v6', 'arm'],
      '386': ['linux/386', '386'],
    };

    const hostPlatforms = archAliases[hostArch] ?? [hostArch];

    for (const stage of context.dockerfile.stages) {
      // Find FROM instructions with --platform flag
      for (const instr of stage.instructions) {
        if (instr.name !== 'FROM') continue;

        const platformMatch = instr.args.match(/--platform=(\S+)/i);
        if (!platformMatch) continue;

        const specifiedPlatform = platformMatch[1].toLowerCase();

        const matches = hostPlatforms.some(
          (hp) => specifiedPlatform === hp.toLowerCase(),
        );

        if (!matches) {
          results.push({
            id: 'build.platform-mismatch',
            title: 'Dockerfile platform does not match host architecture',
            severity: 'warning',
            category: 'build',
            message:
              `\`${instr.raw.trim()}\` at line ${instr.lineno} specifies platform ` +
              `\`${specifiedPlatform}\`, but the Docker host architecture is \`${hostArch}\`. ` +
              'This will either require emulation (slow) or fail if QEMU is not configured.',
            location: context.dockerfile.path,
            line: instr.lineno,
            fixes: [
              {
                description: 'Use docker buildx for cross-platform builds',
                type: 'manual',
                instructions:
                  'If you intentionally need a different platform:\n' +
                  '  1. Set up buildx: `docker buildx create --use`\n' +
                  '  2. Build with: `docker buildx build --platform ' +
                  specifiedPlatform +
                  ' -t <image> .`\n\n' +
                  'If the platform flag is not needed, remove `--platform=' +
                  specifiedPlatform +
                  '` from the FROM instruction to use the native architecture.',
              },
            ],
            meta: {
              hostArch,
              specifiedPlatform,
              line: instr.lineno,
              instruction: instr.raw.trim(),
            },
          });
        }
      }
    }

    return results;
  },
});
