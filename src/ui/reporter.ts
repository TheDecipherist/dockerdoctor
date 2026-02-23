import * as p from '@clack/prompts';
import chalk from 'chalk';
import type { CheckResult, Report, Severity } from '../types/index.js';
import { copyToClipboard, extractCodeBlocks } from './clipboard.js';

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

function formatResultCompact(result: CheckResult): string {
  const icon = SEVERITY_ICONS[result.severity];
  const color = SEVERITY_COLORS[result.severity];
  const category = chalk.dim(`[${result.category}]`);
  return `${icon} ${color(result.title)} ${category}`;
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

/**
 * Interactive browsable results menu.
 * Shows a summary, then lets the user pick a severity category to view.
 * Returns the number of fixes applied.
 */
export async function browseResults(report: Report): Promise<number> {
  const { results, summary } = report;

  if (summary.total === 0) {
    p.log.success(chalk.green('No issues found!'));
    return 0;
  }

  // Show summary line
  const summaryParts: string[] = [];
  if (summary.errors > 0) summaryParts.push(chalk.red(`${summary.errors} error${summary.errors > 1 ? 's' : ''}`));
  if (summary.warnings > 0) summaryParts.push(chalk.yellow(`${summary.warnings} warning${summary.warnings > 1 ? 's' : ''}`));
  if (summary.info > 0) summaryParts.push(chalk.blue(`${summary.info} info`));
  const fixablePart = summary.fixable > 0 ? ` — ${chalk.green(`${summary.fixable} fixable`)}` : '';
  p.log.info(`${summaryParts.join(', ')}${fixablePart}`);

  const errors = results.filter((r) => r.severity === 'error');
  const warnings = results.filter((r) => r.severity === 'warning');
  const infos = results.filter((r) => r.severity === 'info');

  let totalApplied = 0;

  // Browse loop
  while (true) {
    type BrowseAction = 'errors' | 'warnings' | 'info' | 'fixes' | 'done';

    const options: { value: BrowseAction; label: string; hint?: string }[] = [];

    if (errors.length > 0) {
      options.push({
        value: 'errors',
        label: `${chalk.red('Errors')} (${errors.length})`,
        hint: 'View error-level issues',
      });
    }
    if (warnings.length > 0) {
      options.push({
        value: 'warnings',
        label: `${chalk.yellow('Warnings')} (${warnings.length})`,
        hint: 'View warning-level issues',
      });
    }
    if (infos.length > 0) {
      options.push({
        value: 'info',
        label: `${chalk.blue('Info')} (${infos.length})`,
        hint: 'View informational issues',
      });
    }
    if (summary.fixable > 0) {
      options.push({
        value: 'fixes',
        label: `${chalk.green('Apply fixes')} (${summary.fixable} available)`,
      });
    }
    options.push({ value: 'done', label: 'Done' });

    const action = await p.select<BrowseAction>({
      message: 'Browse results:',
      options,
    });

    if (p.isCancel(action) || action === 'done') {
      break;
    }

    if (action === 'fixes') {
      const applied = await browseFixableResults(results);
      totalApplied += applied;
      continue;
    }

    const group =
      action === 'errors' ? errors
        : action === 'warnings' ? warnings
          : infos;
    const label =
      action === 'errors' ? 'Errors'
        : action === 'warnings' ? 'Warnings'
          : 'Info';

    await browseCategory(group, label);
  }

  return totalApplied;
}

/**
 * Browse results within a severity category.
 * Shows a list of results, user picks one to see full details.
 */
async function browseCategory(
  group: CheckResult[],
  label: string,
): Promise<void> {
  while (true) {
    type CatAction = number | 'back';

    const options: { value: CatAction; label: string; hint?: string }[] = group.map(
      (result, idx) => ({
        value: idx,
        label: formatResultCompact(result),
        hint: result.location
          ? (result.line ? `${result.location}:${result.line}` : result.location)
          : undefined,
      }),
    );
    options.push({ value: 'back', label: chalk.dim('<- Back') });

    const selection = await p.select<CatAction>({
      message: `${label} (${group.length}):`,
      options,
    });

    if (p.isCancel(selection) || selection === 'back') {
      break;
    }

    const result = group[selection as number];
    showResultDetail(result);

    // Offer to copy code examples to clipboard
    const code = extractCodeBlocks(
      result.fixes
        .filter((f) => f.instructions)
        .map((f) => f.instructions!)
        .join('\n\n'),
    );
    if (code) {
      const shouldCopy = await p.confirm({ message: 'Copy fix example to clipboard?' });
      if (!p.isCancel(shouldCopy) && shouldCopy) {
        if (copyToClipboard(code)) {
          p.log.success('Copied to clipboard!');
        } else {
          p.log.warn('No clipboard tool available');
        }
      }
    }
  }
}

// ── YAML / code highlighting ────────────────────────────────────────────────

function highlightYamlValue(value: string): string {
  const v = value.trim();
  if (!v) return value;
  if (/^["'].*["']$/.test(v)) return chalk.green(value);
  if (/^\d+(\.\d+)?(s|m|ms|h|d|g|mb|gb|k|kb)?$/i.test(v)) return chalk.yellow(value);
  if (/^(true|false)$/i.test(v)) return chalk.yellow(value);
  if (/^\[.*\]$/.test(v)) return chalk.green(value);
  return value;
}

function highlightYaml(line: string): string {
  if (/^\s*#/.test(line)) return chalk.dim(line);
  const kvMatch = line.match(/^(\s*)([\w.-]+)(\s*:\s*)(.*)/);
  if (kvMatch) {
    const [, indent, key, colon, val] = kvMatch;
    return `${indent}${chalk.cyan(key)}${chalk.dim(colon)}${highlightYamlValue(val)}`;
  }
  const listMatch = line.match(/^(\s*-\s+)(.*)/);
  if (listMatch) {
    const [, dash, val] = listMatch;
    return `${chalk.dim(dash)}${highlightYamlValue(val)}`;
  }
  return line;
}

function formatInstructions(text: string): string {
  const output: string[] = [];
  let inFence = false;
  for (const raw of text.split('\n')) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue; // Skip fence markers
    }
    if (!raw.trim()) {
      output.push('');
    } else {
      const highlighted = (inFence || /^\s/.test(raw)) ? highlightYaml(raw) : raw;
      output.push(`    ${highlighted}`);
    }
  }
  return output.join('\n');
}

/**
 * Show full detail for a single result.
 */
function showResultDetail(result: CheckResult): void {
  console.log();
  console.log(formatResult(result));

  for (const fix of result.fixes) {
    if (fix.type === 'manual' && fix.instructions) {
      console.log(`    ${chalk.dim('How to fix:')}`);
      console.log(formatInstructions(fix.instructions));
    }
  }

  console.log();
}

/**
 * Browse fixable results and optionally apply fixes.
 */
async function browseFixableResults(results: CheckResult[]): Promise<number> {
  const fixable = results.filter((r) =>
    r.fixes.some((f) => f.type === 'auto' && f.apply),
  );
  const manualOnly = results.filter(
    (r) => r.fixes.length > 0 && !r.fixes.some((f) => f.type === 'auto' && f.apply),
  );

  let applied = 0;

  if (fixable.length > 0) {
    p.log.info(`${fixable.length} auto-fixable issue${fixable.length > 1 ? 's' : ''}`);

    for (const result of fixable) {
      console.log();
      console.log(`  ${SEVERITY_ICONS[result.severity]} ${SEVERITY_COLORS[result.severity](result.title)}`);
      console.log(`    ${result.message}`);

      for (const fix of result.fixes) {
        if (fix.type !== 'auto' || !fix.apply) continue;

        const confirm = await p.confirm({
          message: `Apply fix: ${fix.description}?`,
        });

        if (p.isCancel(confirm)) return applied;
        if (!confirm) continue;

        try {
          const success = await fix.apply();
          if (success) {
            p.log.success(`Fixed: ${fix.description}`);
            applied++;
          } else {
            p.log.error('Fix failed. Try the manual approach.');
          }
        } catch (err) {
          p.log.error(`Fix errored: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  if (manualOnly.length > 0) {
    p.log.info(`${manualOnly.length} issue${manualOnly.length > 1 ? 's' : ''} with manual fix suggestions only:`);
    for (const result of manualOnly) {
      console.log();
      console.log(`  ${SEVERITY_ICONS[result.severity]} ${SEVERITY_COLORS[result.severity](result.title)}`);
      for (const fix of result.fixes) {
        console.log(`    ${chalk.dim('Fix:')} ${fix.description}`);
        if (fix.instructions) {
          console.log(formatInstructions(fix.instructions));
        }
      }
    }
    console.log();
  }

  return applied;
}
