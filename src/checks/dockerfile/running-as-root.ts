import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'dockerfile.running-as-root',
  name: 'Container Running as Root',
  category: 'dockerfile',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];
    const { stages } = context.dockerfile;

    if (stages.length === 0) return [];

    // Only check the final stage — that is the one that actually runs
    const finalStage = stages[stages.length - 1];

    const hasUserInstruction = finalStage.instructions.some(
      (instr) => instr.name === 'USER' && instr.args.trim() !== '' && instr.args.trim() !== 'root'
    );

    if (!hasUserInstruction) {
      // Find the CMD or ENTRYPOINT line for better location reporting
      const runtimeInstr = finalStage.instructions.find(
        (instr) => instr.name === 'CMD' || instr.name === 'ENTRYPOINT'
      );

      const line = runtimeInstr?.lineno ?? finalStage.startLine;

      results.push({
        id: 'dockerfile.running-as-root',
        title: 'No USER instruction — container runs as root',
        severity: 'warning',
        category: 'dockerfile',
        message:
          `The final stage of the Dockerfile (based on \`${finalStage.baseImage}\`) ` +
          `does not contain a USER instruction that switches to a non-root user. ` +
          `By default, Docker containers run as root, which is a security risk. ` +
          `If an attacker exploits the application, they gain root access inside ` +
          `the container and potentially to the host via volume mounts or kernel exploits.`,
        location: context.dockerfile.path,
        line,
        fixes: [
          {
            description: 'Add a non-root USER instruction',
            type: 'manual',
            instructions:
              'Add a USER instruction to the final stage of your Dockerfile. ' +
              'Place it after all file operations (COPY, RUN) but before CMD/ENTRYPOINT:\n\n' +
              '  # Create a non-root user\n' +
              '  RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser\n' +
              '  USER appuser\n\n' +
              '  CMD ["node", "dist/index.js"]\n\n' +
              'For Node.js images, you can also use the built-in `node` user:\n' +
              '  USER node\n\n' +
              'Make sure all files the application needs are readable by this user ' +
              '(use --chown in COPY instructions).',
          },
        ],
        meta: {
          finalStageBaseImage: finalStage.baseImage,
          finalStageName: finalStage.name,
        },
      });
    }

    return results;
  },
});
