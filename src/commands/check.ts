import { spinner } from '@clack/prompts';
import type { CheckCategory, CliOptions } from '../types/index.js';
import { buildContext } from '../context.js';
import { runChecks } from '../runner.js';
import { getVersion } from '../version.js';
import { showBanner, showContext, showOutro } from '../ui/banner.js';
import { printResults, printSummary } from '../ui/reporter.js';
import { promptFixes, autoApplyFixes } from '../ui/prompts.js';

export async function checkCommand(
  opts: CliOptions,
  categories?: CheckCategory[],
): Promise<number> {
  const isInteractive = !opts.json && !opts.ci;

  if (isInteractive) {
    showBanner(getVersion());
  }

  const context = await buildContext(process.cwd(), {
    dockerfilePath: opts.file,
    composePath: opts.composefile,
  });

  if (isInteractive) {
    showContext({
      dockerfilePath: context.files.dockerfilePath,
      composePath: context.files.composePath,
      dockerignorePath: context.files.dockerignorePath,
      dockerAvailable: context.dockerAvailable,
    });
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

  // Interactive output
  printResults(report.results);
  printSummary(report);

  if (opts.fix) {
    const applied = await autoApplyFixes(report.results);
    if (applied > 0) {
      showOutro(`Applied ${applied} fix${applied > 1 ? 'es' : ''}`);
    } else {
      showOutro('Done');
    }
  } else if (report.summary.fixable > 0) {
    const applied = await promptFixes(report.results);
    if (applied > 0) {
      showOutro(`Applied ${applied} fix${applied > 1 ? 'es' : ''}`);
    } else {
      showOutro('Done');
    }
  } else {
    showOutro('Done');
  }

  return report.summary.errors > 0 ? 1 : 0;
}
