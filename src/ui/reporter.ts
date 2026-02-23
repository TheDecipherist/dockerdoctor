import chalk from 'chalk';
import type { CheckResult, Report, Severity } from '../types/index.js';

const SEVERITY_ICONS: Record<Severity, string> = {
  error: chalk.red('x'),
  warning: chalk.yellow('!'),
  info: chalk.blue('i'),
};

const SEVERITY_COLORS: Record<Severity, (s: string) => string> = {
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
};

function formatResult(result: CheckResult): string {
  const icon = SEVERITY_ICONS[result.severity];
  const color = SEVERITY_COLORS[result.severity];
  const id = chalk.dim(`[${result.id}]`);

  let output = `  ${icon} ${color(result.title)} ${id}`;

  if (result.location) {
    const loc = result.line ? `${result.location}:${result.line}` : result.location;
    output += `\n    ${chalk.dim(loc)}`;
  }

  output += `\n    ${result.message}`;

  if (result.fixes.length > 0) {
    const fixCount = result.fixes.length;
    const autoFixes = result.fixes.filter((f) => f.type === 'auto').length;
    if (autoFixes > 0) {
      output += `\n    ${chalk.green(`${autoFixes} auto-fix available`)}`;
    } else {
      output += `\n    ${chalk.dim(`${fixCount} manual fix suggestion${fixCount > 1 ? 's' : ''}`)}`;
    }
  }

  return output;
}

export function printResults(results: CheckResult[]): void {
  if (results.length === 0) {
    console.log(chalk.green('  No issues found!'));
    return;
  }

  // Group by severity, errors first
  const errors = results.filter((r) => r.severity === 'error');
  const warnings = results.filter((r) => r.severity === 'warning');
  const infos = results.filter((r) => r.severity === 'info');

  for (const [label, group] of [
    ['Errors', errors],
    ['Warnings', warnings],
    ['Info', infos],
  ] as const) {
    if (group.length === 0) continue;
    console.log();
    console.log(chalk.bold(`  ${label} (${group.length})`));
    console.log();
    for (const result of group) {
      console.log(formatResult(result));
      console.log();
    }
  }
}

export function printSummary(report: Report): void {
  const { summary } = report;
  const parts: string[] = [];

  if (summary.errors > 0) parts.push(chalk.red(`${summary.errors} error${summary.errors > 1 ? 's' : ''}`));
  if (summary.warnings > 0)
    parts.push(chalk.yellow(`${summary.warnings} warning${summary.warnings > 1 ? 's' : ''}`));
  if (summary.info > 0) parts.push(chalk.blue(`${summary.info} info`));

  if (summary.total === 0) {
    console.log(chalk.green('  All clear — no issues found!'));
  } else {
    console.log(
      `  Found ${chalk.bold(String(summary.total))} issue${summary.total > 1 ? 's' : ''}: ${parts.join(', ')}` +
        (summary.fixable > 0 ? ` — ${chalk.green(`${summary.fixable} fixable`)}` : ''),
    );
  }
}
