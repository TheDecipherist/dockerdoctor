import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CheckResult, Report } from '../../../src/types/index.js';
import { printResults, printSummary } from '../../../src/ui/reporter.js';

function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: 'test.check',
    title: 'Test Issue',
    severity: 'warning',
    category: 'dockerfile',
    message: 'Test message',
    fixes: [],
    ...overrides,
  };
}

function makeReport(results: CheckResult[]): Report {
  return {
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    dockerAvailable: false,
    results,
    summary: {
      total: results.length,
      errors: results.filter((r) => r.severity === 'error').length,
      warnings: results.filter((r) => r.severity === 'warning').length,
      info: results.filter((r) => r.severity === 'info').length,
      fixable: results.filter((r) => r.fixes.length > 0).length,
    },
  };
}

describe('reporter', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function allOutput(): string {
    return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
  }

  describe('printResults', () => {
    it('should print "No issues found" for empty results', () => {
      printResults([]);

      expect(allOutput()).toContain('No issues found');
    });

    it('should group by severity — errors first, then warnings, then info', () => {
      const results = [
        makeResult({ id: 'w1', title: 'Warning One', severity: 'warning' }),
        makeResult({ id: 'e1', title: 'Error One', severity: 'error' }),
        makeResult({ id: 'i1', title: 'Info One', severity: 'info' }),
      ];

      printResults(results);

      const output = allOutput();
      const errorsPos = output.indexOf('Errors');
      const warningsPos = output.indexOf('Warnings');
      const infoPos = output.indexOf('Info');

      expect(errorsPos).toBeGreaterThan(-1);
      expect(warningsPos).toBeGreaterThan(-1);
      expect(infoPos).toBeGreaterThan(-1);

      // Errors section appears before Warnings, which appears before Info
      expect(errorsPos).toBeLessThan(warningsPos);
      expect(warningsPos).toBeLessThan(infoPos);
    });

    it('should show location and line number when present', () => {
      const results = [
        makeResult({
          location: 'Dockerfile',
          line: 42,
        }),
      ];

      printResults(results);

      const output = allOutput();
      expect(output).toContain('Dockerfile:42');
    });

    it('should show location without line number when line is not present', () => {
      const results = [
        makeResult({
          location: 'docker-compose.yml',
        }),
      ];

      printResults(results);

      const output = allOutput();
      expect(output).toContain('docker-compose.yml');
      // Should not have a colon followed by a number appended
      expect(output).not.toContain('docker-compose.yml:');
    });

    it('should show auto-fix count when fixes have type auto', () => {
      const results = [
        makeResult({
          fixes: [
            { description: 'Fix it', type: 'auto', apply: async () => true },
          ],
        }),
      ];

      printResults(results);

      const output = allOutput();
      expect(output).toContain('auto-fix available');
    });

    it('should show manual fix suggestion count', () => {
      const results = [
        makeResult({
          fixes: [
            { description: 'Do this manually', type: 'manual' },
            { description: 'And this too', type: 'manual' },
          ],
        }),
      ];

      printResults(results);

      const output = allOutput();
      expect(output).toContain('manual fix suggestion');
    });

    it('should handle results with no fixes', () => {
      const results = [
        makeResult({ fixes: [] }),
      ];

      printResults(results);

      const output = allOutput();
      // Should still display the result without fix lines
      expect(output).toContain('Test Issue');
      expect(output).toContain('Test message');
      expect(output).not.toContain('auto-fix');
      expect(output).not.toContain('manual fix');
    });
  });

  describe('printSummary', () => {
    it('should show "All clear" for zero issues', () => {
      const report = makeReport([]);

      printSummary(report);

      expect(allOutput()).toContain('All clear');
    });

    it('should show error count', () => {
      const report = makeReport([
        makeResult({ severity: 'error' }),
      ]);

      printSummary(report);

      const output = allOutput();
      expect(output).toContain('1 error');
    });

    it('should show warning count', () => {
      const report = makeReport([
        makeResult({ severity: 'warning' }),
      ]);

      printSummary(report);

      const output = allOutput();
      expect(output).toContain('1 warning');
    });

    it('should show info count', () => {
      const report = makeReport([
        makeResult({ severity: 'info' }),
      ]);

      printSummary(report);

      const output = allOutput();
      expect(output).toContain('1 info');
    });

    it('should show fixable count when greater than 0', () => {
      const report = makeReport([
        makeResult({
          severity: 'warning',
          fixes: [{ description: 'Fix it', type: 'auto', apply: async () => true }],
        }),
      ]);

      printSummary(report);

      const output = allOutput();
      expect(output).toContain('1 fixable');
    });

    it('should not show fixable when count is 0', () => {
      const report = makeReport([
        makeResult({ severity: 'warning', fixes: [] }),
      ]);

      printSummary(report);

      const output = allOutput();
      expect(output).not.toContain('fixable');
    });

    it('should use proper pluralization — "1 error" vs "2 errors"', () => {
      const singleErrorReport = makeReport([
        makeResult({ severity: 'error' }),
      ]);

      printSummary(singleErrorReport);
      const singleOutput = allOutput();
      expect(singleOutput).toContain('1 error');
      expect(singleOutput).not.toContain('1 errors');

      logSpy.mockClear();

      const multiErrorReport = makeReport([
        makeResult({ id: 'e1', severity: 'error' }),
        makeResult({ id: 'e2', severity: 'error' }),
      ]);

      printSummary(multiErrorReport);
      const multiOutput = allOutput();
      expect(multiOutput).toContain('2 errors');
    });

    it('should use proper pluralization — "1 warning" vs "2 warnings"', () => {
      const singleReport = makeReport([
        makeResult({ severity: 'warning' }),
      ]);

      printSummary(singleReport);
      const singleOutput = allOutput();
      expect(singleOutput).toContain('1 warning');
      expect(singleOutput).not.toContain('1 warnings');

      logSpy.mockClear();

      const multiReport = makeReport([
        makeResult({ id: 'w1', severity: 'warning' }),
        makeResult({ id: 'w2', severity: 'warning' }),
      ]);

      printSummary(multiReport);
      const multiOutput = allOutput();
      expect(multiOutput).toContain('2 warnings');
    });
  });
});
