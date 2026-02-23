import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'dockerfile.layer-order',
  name: 'Layer Order — COPY . . Before Package File Copy',
  category: 'dockerfile',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const stage of context.dockerfile.stages) {
      let broadCopyLine: number | undefined;
      let broadCopyRaw: string | undefined;

      for (const instr of stage.instructions) {
        if (instr.name !== 'COPY') continue;

        const args = instr.args.trim();

        // Detect broad copy patterns like "COPY . ." or "COPY ./ ./"
        if (/^(?:--[a-z-]+=\S+\s+)*\.\s+\./.test(args) || /^(?:--[a-z-]+=\S+\s+)*\.\/\s+/.test(args)) {
          if (broadCopyLine === undefined) {
            broadCopyLine = instr.lineno;
            broadCopyRaw = instr.raw;
          }
          continue;
        }

        // Detect package file copy patterns (package.json, requirements.txt, go.mod, etc.)
        const packagePatterns = [
          /package[\*\.]?\.?json/i,
          /package-lock\.json/i,
          /yarn\.lock/i,
          /pnpm-lock\.yaml/i,
          /requirements.*\.txt/i,
          /Pipfile/,
          /Gemfile/,
          /go\.mod/,
          /go\.sum/,
          /Cargo\.toml/,
          /Cargo\.lock/,
          /composer\.json/,
          /composer\.lock/,
          /\.csproj/,
          /pom\.xml/,
          /build\.gradle/,
        ];

        const isPackageCopy = packagePatterns.some((p) => p.test(args));

        if (isPackageCopy && broadCopyLine !== undefined) {
          results.push({
            id: 'dockerfile.layer-order',
            title: 'Inefficient layer order — COPY . . before package file copy',
            severity: 'warning',
            category: 'dockerfile',
            message:
              `\`COPY . .\` at line ${broadCopyLine} appears before the package file copy ` +
              `\`${instr.raw.trim()}\` at line ${instr.lineno}. This means every source code ` +
              `change will bust the Docker layer cache and force a full dependency reinstall. ` +
              `Copy dependency manifests first, run the install, then copy the rest of the source.`,
            location: context.dockerfile.path,
            line: broadCopyLine,
            fixes: [
              {
                description: 'Reorder COPY instructions for better layer caching',
                type: 'manual',
                instructions:
                  'Move the package/lock file COPY instruction before `COPY . .`. ' +
                  'The recommended pattern is:\n' +
                  '  1. COPY package*.json ./\n' +
                  '  2. RUN npm ci\n' +
                  '  3. COPY . .\n\n' +
                  'This way, the dependency install layer is only invalidated when ' +
                  'package files change, not on every source code edit.',
              },
            ],
            meta: {
              broadCopyLine,
              broadCopyRaw,
              packageCopyLine: instr.lineno,
              packageCopyRaw: instr.raw,
              stageName: stage.name ?? stage.baseImage,
            },
          });
        }
      }
    }

    return results;
  },
});
