import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'lineendings.missing-dos2unix',
  name: 'Dockerfile Copies .sh Files Without dos2unix',
  category: 'lineendings',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const stage of context.dockerfile.stages) {
      let copiesShFile = false;
      let copyLine: number | undefined;
      let copyRaw: string | undefined;
      let hasDos2unix = false;

      for (const instr of stage.instructions) {
        if ((instr.name === 'COPY' || instr.name === 'ADD') && /\.sh\b/.test(instr.args)) {
          copiesShFile = true;
          if (copyLine === undefined) {
            copyLine = instr.lineno;
            copyRaw = instr.raw;
          }
        }

        if (instr.name === 'RUN' && /dos2unix/.test(instr.args)) {
          hasDos2unix = true;
        }
      }

      if (copiesShFile && !hasDos2unix) {
        results.push({
          id: 'lineendings.missing-dos2unix',
          title: `Stage copies .sh files without running dos2unix`,
          severity: 'warning',
          category: 'lineendings',
          message:
            `A COPY instruction at line ${copyLine} copies shell script(s) into the image ` +
            `(\`${copyRaw?.trim()}\`), but no \`dos2unix\` command is run in the same stage. ` +
            `If a contributor on Windows commits a .sh file with CRLF endings, the script ` +
            `will fail inside the container. Running \`dos2unix\` after copying provides a ` +
            `safety net regardless of the contributor's OS.`,
          location: context.dockerfile.path,
          line: copyLine,
          fixes: [
            {
              description: 'Add dos2unix after copying shell scripts',
              type: 'manual',
              instructions:
                `Install and run \`dos2unix\` after copying shell scripts:\n\n` +
                `  # For Alpine:\n` +
                `  RUN apk add --no-cache dos2unix && \\\n` +
                `      dos2unix /app/*.sh && \\\n` +
                `      apk del dos2unix\n\n` +
                `  # For Debian/Ubuntu:\n` +
                `  RUN apt-get update && apt-get install -y --no-install-recommends dos2unix && \\\n` +
                `      dos2unix /app/*.sh && \\\n` +
                `      apt-get purge -y dos2unix && apt-get autoremove -y && \\\n` +
                `      rm -rf /var/lib/apt/lists/*\n\n` +
                `  # Alternative without installing dos2unix:\n` +
                `  RUN sed -i 's/\\r$//' /app/*.sh\n\n` +
                `The best long-term fix is to add a .gitattributes file to enforce LF endings.`,
            },
          ],
          meta: {
            stageName: stage.name ?? stage.baseImage,
            copyLine,
          },
        });
      }
    }

    return results;
  },
});
