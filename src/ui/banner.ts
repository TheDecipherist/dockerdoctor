import chalk from 'chalk';
import { intro, outro, log } from '@clack/prompts';

export function showBanner(version: string): void {
  intro(chalk.bgCyan.black(` dockerdoctor v${version} `));
}

export async function showUpdateNotice(): Promise<void> {
  try {
    const { getUpdateInfo } = await import('../telemetry.js');
    const info = await getUpdateInfo();
    if (info?.updateAvailable) {
      log.info(
        chalk.yellow(`Update available: v${info.current} → v${info.latest}`) +
        chalk.dim(`  Run: npm update -g dockerdoctor`),
      );
    }
  } catch {
    // Never let update check affect the CLI
  }
}

export function showContext(ctx: {
  dockerfilePath?: string;
  composePath?: string;
  dockerignorePath?: string;
  dockerAvailable: boolean;
}): void {
  const lines: string[] = [];
  if (ctx.dockerfilePath) lines.push(`${chalk.green('+')} Dockerfile: ${ctx.dockerfilePath}`);
  else lines.push(`${chalk.yellow('-')} No Dockerfile found`);

  if (ctx.composePath) lines.push(`${chalk.green('+')} Compose: ${ctx.composePath}`);
  else lines.push(`${chalk.dim('-')} No compose file found`);

  if (ctx.dockerignorePath) lines.push(`${chalk.green('+')} .dockerignore found`);
  else lines.push(`${chalk.yellow('-')} No .dockerignore found`);

  lines.push(
    ctx.dockerAvailable
      ? `${chalk.green('+')} Docker: connected`
      : `${chalk.dim('-')} Docker: not available (runtime checks skipped)`,
  );

  console.log(lines.map((l) => `  ${l}`).join('\n'));
  console.log();
}

export async function showOutro(message: string): Promise<void> {
  await showUpdateNotice();
  outro(chalk.green(message));
}
