import type { Check, CheckContext, CheckResult, CheckCategory, Severity, Report } from './types/index.js';
import { getAllChecks, getChecksByCategory } from './checks/registry.js';
import { getVersion } from './version.js';

function filterBySeverity(results: CheckResult[], minSeverity: Severity): CheckResult[] {
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  const threshold = order[minSeverity];
  return results.filter((r) => order[r.severity] <= threshold);
}

export async function runChecks(
  context: CheckContext,
  opts?: {
    categories?: CheckCategory[];
    minSeverity?: Severity;
    onCheckStart?: (check: Check) => void;
    onCheckComplete?: (check: Check, results: CheckResult[]) => void;
  },
): Promise<Report> {
  let checks: Check[];
  if (opts?.categories?.length) {
    checks = opts.categories.flatMap((cat) => getChecksByCategory(cat));
  } else {
    checks = getAllChecks();
  }

  // Skip runtime checks if Docker is not available
  checks = checks.filter((c) => !c.requiresDocker || context.dockerAvailable);

  const allResults: CheckResult[] = [];

  for (const check of checks) {
    opts?.onCheckStart?.(check);
    try {
      const results = await check.run(context);
      allResults.push(...results);
      opts?.onCheckComplete?.(check, results);
    } catch (err) {
      // If a check throws, record it as an info-level result
      allResults.push({
        id: check.id,
        title: `Check failed: ${check.name}`,
        severity: 'info',
        category: check.category,
        message: err instanceof Error ? err.message : String(err),
        fixes: [],
      });
      opts?.onCheckComplete?.(check, []);
    }
  }

  const filtered = opts?.minSeverity ? filterBySeverity(allResults, opts.minSeverity) : allResults;

  const summary = {
    total: filtered.length,
    errors: filtered.filter((r) => r.severity === 'error').length,
    warnings: filtered.filter((r) => r.severity === 'warning').length,
    info: filtered.filter((r) => r.severity === 'info').length,
    fixable: filtered.filter((r) => r.fixes.length > 0).length,
  };

  return {
    timestamp: new Date().toISOString(),
    version: getVersion(),
    dockerAvailable: context.dockerAvailable,
    results: filtered,
    summary,
  };
}
