import chalk from 'chalk';
import { intro, outro } from '@clack/prompts';

export function showBanner(version: string): void {
  intro(chalk.bgCyan.black(` dockerdoctor v${version} `));
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

export function showOutro(message: string): void {
  outro(chalk.green(message));
}
