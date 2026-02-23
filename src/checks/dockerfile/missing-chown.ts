import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'dockerfile.missing-chown',
  name: 'COPY Without --chown After USER Instruction',
  category: 'dockerfile',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const stage of context.dockerfile.stages) {
      let activeUser: string | undefined;
      let userLine: number | undefined;

      for (const instr of stage.instructions) {
        // Track USER instructions
        if (instr.name === 'USER') {
          const user = instr.args.trim();
          if (user && user !== 'root') {
            activeUser = user;
            userLine = instr.lineno;
          } else if (user === 'root') {
            // If switched back to root, reset
            activeUser = undefined;
            userLine = undefined;
          }
          continue;
        }

        // Check COPY instructions after a non-root USER is set
        if ((instr.name === 'COPY' || instr.name === 'ADD') && activeUser) {
          const hasChown = /--chown=/.test(instr.args);

          if (!hasChown) {
            results.push({
              id: 'dockerfile.missing-chown',
              title: `${instr.name} without --chown after USER ${activeUser}`,
              severity: 'warning',
              category: 'dockerfile',
              message:
                `\`${instr.raw.trim()}\` at line ${instr.lineno} does not use \`--chown\`, ` +
                `but the container user was changed to \`${activeUser}\` at line ${userLine}. ` +
                `Without --chown, copied files are owned by root and may not be readable ` +
                `or writable by the running user, causing permission denied errors at runtime.`,
              location: context.dockerfile.path,
              line: instr.lineno,
              fixes: [
                {
                  description: `Add --chown=${activeUser} to the ${instr.name} instruction`,
                  type: 'manual',
                  instructions:
                    `Add \`--chown=${activeUser}:${activeUser}\` to the ${instr.name} instruction:\n\n` +
                    `  Before: ${instr.raw.trim()}\n` +
                    `  After:  ${instr.name} --chown=${activeUser}:${activeUser} ${instr.args.trim()}\n\n` +
                    `This ensures the copied files are owned by the non-root user ` +
                    `and avoids permission issues at runtime.`,
                },
              ],
              meta: {
                instruction: instr.name,
                activeUser,
                userLine,
                rawInstruction: instr.raw,
                stageName: stage.name ?? stage.baseImage,
              },
            });
          }
        }
      }
    }

    return results;
  },
});
