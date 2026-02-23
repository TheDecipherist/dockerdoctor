import * as p from '@clack/prompts';
import chalk from 'chalk';
import type { CheckResult, Fix } from '../types/index.js';

export async function promptFixes(results: CheckResult[]): Promise<number> {
  const fixableResults = results.filter((r) => r.fixes.length > 0);
  if (fixableResults.length === 0) return 0;

  const shouldFix = await p.confirm({
    message: `${fixableResults.length} issue${fixableResults.length > 1 ? 's have' : ' has'} available fixes. Would you like to review them?`,
  });

  if (p.isCancel(shouldFix) || !shouldFix) return 0;

  let applied = 0;

  for (const result of fixableResults) {
    console.log();
    console.log(`  ${chalk.bold(result.title)} ${chalk.dim(`[${result.id}]`)}`);
    console.log(`  ${result.message}`);

    for (const fix of result.fixes) {
      if (fix.type === 'manual') {
        console.log();
        console.log(`  ${chalk.dim('Manual fix:')} ${fix.description}`);
        if (fix.instructions) {
          console.log(`  ${chalk.dim(fix.instructions)}`);
        }
        continue;
      }

      if (fix.type === 'auto' && fix.apply) {
        const confirm = await p.confirm({
          message: `Apply fix: ${fix.description}?`,
        });

        if (p.isCancel(confirm) || !confirm) continue;

        try {
          const success = await fix.apply();
          if (success) {
            console.log(`  ${chalk.green('Fixed!')} ${fix.description}`);
            applied++;
          } else {
            console.log(`  ${chalk.red('Fix failed.')} Try the manual approach.`);
          }
        } catch (err) {
          console.log(
            `  ${chalk.red('Fix errored:')} ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  return applied;
}

export async function autoApplyFixes(results: CheckResult[]): Promise<number> {
  let applied = 0;
  for (const result of results) {
    for (const fix of result.fixes) {
      if (fix.type === 'auto' && fix.apply) {
        try {
          const success = await fix.apply();
          if (success) applied++;
        } catch {
          // Silently skip failed auto-fixes in CI mode
        }
      }
    }
  }
  return applied;
}
