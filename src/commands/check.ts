import chalk from 'chalk';
import { spinner } from '@clack/prompts';
import type { CheckCategory, CheckContext, CliOptions } from '../types/index.js';
import { buildContext } from '../context.js';
import { runChecks } from '../runner.js';
import { getVersion } from '../version.js';
import { showBanner, showContext, showOutro } from '../ui/banner.js';
import { printResults, printSummary } from '../ui/reporter.js';
import { promptFixes, autoApplyFixes } from '../ui/prompts.js';

export async function checkCommand(
  opts: CliOptions,
  categories?: CheckCategory[],
  prebuiltContext?: CheckContext,
): Promise<number> {
  const isInteractive = !opts.json && !opts.ci;

  const context = prebuiltContext ?? await buildContext(process.cwd(), {
    dockerfilePath: opts.file,
    composePath: opts.composefile,
  });

  // When called directly (not from interactive menu), show banner + context
  if (!prebuiltContext) {
    if (isInteractive) {
      showBanner(getVersion());
      showContext({
        dockerfilePath: context.files.dockerfilePath,
        composePath: context.files.composePath,
        dockerignorePath: context.files.dockerignorePath,
        dockerAvailable: context.dockerAvailable,
      });
    }

    const noFilesFound =
      !context.files.dockerfilePath &&
      !context.files.composePath &&
      !context.files.dockerignorePath;
    if (noFilesFound && !categories) {
      const msg = `Warning: No Dockerfile or compose file found in ${process.cwd()}. Only runtime checks will run.`;
      if (isInteractive) {
        console.log(`  ${chalk.yellow('⚠')} ${chalk.yellow(msg)}\n`);
      } else {
        console.error(msg);
      }
    }
  }

  let s: ReturnType<typeof spinner> | undefined;
  if (isInteractive) {
    s = spinner();
    s.start('Running checks...');
  }

  const report = await runChecks(context, {
    categories,
    minSeverity: opts.severity,
  });

  if (isInteractive && s) {
    s.stop(`Completed ${report.summary.total} check${report.summary.total !== 1 ? 's' : ''}`);
  }

  // JSON/CI output
  if (opts.json || opts.ci) {
    console.log(JSON.stringify(report, null, 2));
    return report.summary.errors > 0 ? 1 : 0;
  }

  // Interactive menu mode — TUI split-screen browser or clack fallback
  if (prebuiltContext) {
    const { canUseTUI, browseResultsTUI } = await import('../ui/browse-tui.js');

    if (canUseTUI()) {
      await browseResultsTUI(report, context.cwd, categories);
      // After TUI exits, handle fixes via clack prompts
      if (report.summary.fixable > 0) {
        const applied = opts.fix
          ? await autoApplyFixes(report.results)
          : await promptFixes(report.results);
        if (applied > 0) {
          await showOutro(`Applied ${applied} fix${applied > 1 ? 'es' : ''}`);
        } else {
          await showOutro('Done');
        }
      } else {
        await showOutro('Done');
      }
    } else {
      // Non-TUI fallback (small terminal, piped output)
      printResults(report.results);
      printSummary(report);
      await showOutro('Done');
    }

    return report.summary.errors > 0 ? 1 : 0;
  }

  // Direct command mode — dump all results
  printResults(report.results);
  printSummary(report);

  if (opts.fix) {
    const applied = await autoApplyFixes(report.results);
    if (applied > 0) {
      await showOutro(`Applied ${applied} fix${applied > 1 ? 'es' : ''}`);
    } else {
      await showOutro('Done');
    }
  } else if (report.summary.fixable > 0) {
    const applied = await promptFixes(report.results);
    if (applied > 0) {
      await showOutro(`Applied ${applied} fix${applied > 1 ? 'es' : ''}`);
    } else {
      await showOutro('Done');
    }
  } else {
    await showOutro('Done');
  }

  return report.summary.errors > 0 ? 1 : 0;
}
