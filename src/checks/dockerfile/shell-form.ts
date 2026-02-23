import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'dockerfile.shell-form',
  name: 'CMD/ENTRYPOINT Uses Shell Form',
  category: 'dockerfile',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const instr of context.dockerfile.allInstructions) {
      if (instr.name !== 'CMD' && instr.name !== 'ENTRYPOINT') continue;

      const args = instr.args.trim();

      // Exec form starts with "[", shell form does not
      if (args.startsWith('[')) continue;

      // Skip empty instructions
      if (args.length === 0) continue;

      results.push({
        id: 'dockerfile.shell-form',
        title: `${instr.name} uses shell form`,
        severity: 'warning',
        category: 'dockerfile',
        message:
          `\`${instr.raw.trim()}\` at line ${instr.lineno} uses shell form. ` +
          `Shell form wraps the command in \`/bin/sh -c "..."\`, which means the ` +
          `application process is not PID 1 and will NOT receive signals like ` +
          `SIGTERM from \`docker stop\`. This causes a 10-second timeout on shutdown ` +
          `instead of a graceful stop. Exec form runs the process directly as PID 1, ` +
          `ensuring proper signal handling.`,
        location: context.dockerfile.path,
        line: instr.lineno,
        fixes: [
          {
            description: `Convert ${instr.name} to exec form`,
            type: 'manual',
            instructions:
              `Rewrite the ${instr.name} instruction in exec (JSON array) form:\n\n` +
              `  Shell form (current): ${instr.raw.trim()}\n` +
              `  Exec form (recommended): ${instr.name} ${suggestExecForm(args)}\n\n` +
              `Exec form rules:\n` +
              `  - Use a JSON array: ${instr.name} ["executable", "arg1", "arg2"]\n` +
              `  - Each argument is a separate string in the array\n` +
              `  - No shell expansion ($VAR, *, etc.) — if you need it, use:\n` +
              `    ${instr.name} ["sh", "-c", "your command with $VAR"]`,
          },
        ],
        meta: {
          instruction: instr.name,
          currentForm: 'shell',
          rawInstruction: instr.raw,
        },
      });
    }

    return results;
  },
});

/**
 * Attempt to suggest an exec form conversion for a shell-form command.
 */
function suggestExecForm(shellArgs: string): string {
  // Split on whitespace, naive but helpful for simple cases
  const parts = shellArgs.trim().split(/\s+/);
  const quoted = parts.map((p) => `"${p}"`).join(', ');
  return `[${quoted}]`;
}
