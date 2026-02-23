import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

const BUILD_TOOL_PATTERNS = [
  /\bgcc\b/,
  /\bg\+\+\b/,
  /\bmake\b/,
  /\bcmake\b/,
  /\bpython[23]?\b/,
  /\bbuild-essential\b/,
  /\bbuild-base\b/,
  /\bautoconf\b/,
  /\bautomake\b/,
  /\blibtool\b/,
  /\bnasm\b/,
  /\bpkg-config\b/,
  /\brust[c]?\b/,
  /\bcargo\b/,
  /\bgo\b(?!ing)/,
  /\bjavac\b/,
  /\bmaven\b/,
  /\bgradle\b/,
  /\blibffi-dev\b/,
  /\blibssl-dev\b/,
];

registerCheck({
  id: 'dockerfile.missing-multistage',
  name: 'Missing Multi-Stage Build',
  category: 'dockerfile',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];
    const { stages } = context.dockerfile;

    // Only flag when there is exactly one stage
    if (stages.length !== 1) return [];

    const stage = stages[0];
    const foundTools: string[] = [];
    let firstToolLine: number | undefined;

    for (const instr of stage.instructions) {
      if (instr.name !== 'RUN') continue;

      const cmd = instr.args;
      for (const pattern of BUILD_TOOL_PATTERNS) {
        const match = cmd.match(pattern);
        if (match && !foundTools.includes(match[0])) {
          foundTools.push(match[0]);
          if (firstToolLine === undefined) {
            firstToolLine = instr.lineno;
          }
        }
      }
    }

    if (foundTools.length > 0) {
      results.push({
        id: 'dockerfile.missing-multistage',
        title: 'Build tools installed without multi-stage build',
        severity: 'warning',
        category: 'dockerfile',
        message:
          `This Dockerfile has a single stage and installs build/dev tools ` +
          `(${foundTools.join(', ')}). Without a multi-stage build, these tools ` +
          `remain in the final image, increasing its size and attack surface. ` +
          `Use a multi-stage build to compile in one stage and copy only the ` +
          `artifacts to a slim final stage.`,
        location: context.dockerfile.path,
        line: firstToolLine,
        fixes: [
          {
            description: 'Convert to a multi-stage build',
            type: 'manual',
            instructions:
              'Split the Dockerfile into two (or more) stages:\n\n' +
              '  # Build stage\n' +
              '  FROM node:20 AS builder\n' +
              '  WORKDIR /app\n' +
              '  COPY . .\n' +
              '  RUN npm ci && npm run build\n\n' +
              '  # Production stage\n' +
              '  FROM node:20-slim\n' +
              '  WORKDIR /app\n' +
              '  COPY --from=builder /app/dist ./dist\n' +
              '  COPY --from=builder /app/node_modules ./node_modules\n' +
              '  CMD ["node", "dist/index.js"]\n\n' +
              'This keeps build tools out of the final image, ' +
              'dramatically reducing image size and attack surface.',
          },
        ],
        meta: {
          detectedTools: foundTools,
          stageBaseImage: stage.baseImage,
        },
      });
    }

    return results;
  },
});
