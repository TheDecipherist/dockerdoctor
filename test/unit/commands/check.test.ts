import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Report, CheckContext } from '../../../src/types/index.js';

// ── Mock functions ──────────────────────────────────────────────────────────
const mockBuildContext = vi.fn();
const mockRunChecks = vi.fn();
const mockShowBanner = vi.fn();
const mockShowContext = vi.fn();
const mockShowOutro = vi.fn().mockResolvedValue(undefined);
const mockPrintResults = vi.fn();
const mockPrintSummary = vi.fn();
const mockCanUseTUI = vi.fn();
const mockBrowseResultsTUI = vi.fn();
const mockPromptFixes = vi.fn();
const mockAutoApplyFixes = vi.fn();
const mockSpinnerStart = vi.fn();
const mockSpinnerStop = vi.fn();

// ── Module mocks ────────────────────────────────────────────────────────────
vi.mock('../../../src/context.js', () => ({
  buildContext: mockBuildContext,
}));

vi.mock('../../../src/runner.js', () => ({
  runChecks: mockRunChecks,
}));

vi.mock('../../../src/ui/banner.js', () => ({
  showBanner: mockShowBanner,
  showContext: mockShowContext,
  showOutro: mockShowOutro,
}));

vi.mock('../../../src/ui/reporter.js', () => ({
  printResults: mockPrintResults,
  printSummary: mockPrintSummary,
}));

vi.mock('../../../src/ui/browse-tui.js', () => ({
  canUseTUI: mockCanUseTUI,
  browseResultsTUI: mockBrowseResultsTUI,
}));

vi.mock('../../../src/ui/prompts.js', () => ({
  promptFixes: mockPromptFixes,
  autoApplyFixes: mockAutoApplyFixes,
}));

vi.mock('@clack/prompts', () => ({
  spinner: () => ({ start: mockSpinnerStart, stop: mockSpinnerStop }),
}));

// Side-effect-only import; no exports needed
vi.mock('../../../src/checks/index.js', () => ({}));

// ── Dynamic import (after mocks are wired) ──────────────────────────────────
const { checkCommand } = await import('../../../src/commands/check.js');

// ── Helpers ─────────────────────────────────────────────────────────────────
const mockContext: CheckContext = {
  cwd: '/test',
  dockerAvailable: false,
  files: {
    shellScripts: [],
    dockerfilePath: '/test/Dockerfile',
    composePath: '/test/docker-compose.yml',
    dockerignorePath: '/test/.dockerignore',
  },
};

function makeReport(errors = 0, fixable = 0): Report {
  const results = Array.from({ length: errors }, (_, i) => ({
    id: `test.error.${i}`,
    title: 'Test Error',
    severity: 'error' as const,
    category: 'dockerfile' as const,
    message: 'Something is wrong',
    fixes: i < fixable
      ? [{ description: 'Fix it', type: 'auto' as const, apply: async () => true }]
      : [],
  }));

  return {
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    dockerAvailable: false,
    results,
    summary: {
      total: errors,
      errors,
      warnings: 0,
      info: 0,
      fixable,
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe('checkCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildContext.mockResolvedValue(mockContext);
    mockCanUseTUI.mockReturnValue(false);
    mockBrowseResultsTUI.mockResolvedValue(undefined);
    mockPromptFixes.mockResolvedValue(0);
    mockAutoApplyFixes.mockResolvedValue(0);
  });

  // ── JSON / CI mode ──────────────────────────────────────────────────────
  describe('JSON mode', () => {
    it('outputs JSON to console.log and does not show interactive UI', async () => {
      const report = makeReport(0);
      mockRunChecks.mockResolvedValue(report);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await checkCommand({ json: true });

      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(report, null, 2));
      expect(mockShowBanner).not.toHaveBeenCalled();
      expect(mockShowContext).not.toHaveBeenCalled();
      expect(mockSpinnerStart).not.toHaveBeenCalled();
      expect(mockPrintResults).not.toHaveBeenCalled();
      expect(mockPrintSummary).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('CI mode', () => {
    it('outputs JSON and does not show interactive UI', async () => {
      const report = makeReport(1);
      mockRunChecks.mockResolvedValue(report);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const exitCode = await checkCommand({ ci: true });

      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(report, null, 2));
      expect(mockShowBanner).not.toHaveBeenCalled();
      expect(mockShowContext).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);

      consoleSpy.mockRestore();
    });
  });

  // ── Interactive mode ────────────────────────────────────────────────────
  describe('interactive mode', () => {
    it('calls showBanner, showContext, spinner, printResults, printSummary, and showOutro', async () => {
      const report = makeReport(0);
      mockRunChecks.mockResolvedValue(report);

      await checkCommand({});

      expect(mockShowBanner).toHaveBeenCalledWith('0.1.0');
      expect(mockShowContext).toHaveBeenCalledWith({
        dockerfilePath: mockContext.files.dockerfilePath,
        composePath: mockContext.files.composePath,
        dockerignorePath: mockContext.files.dockerignorePath,
        dockerAvailable: mockContext.dockerAvailable,
      });
      expect(mockSpinnerStart).toHaveBeenCalledWith('Running checks...');
      expect(mockSpinnerStop).toHaveBeenCalled();
      expect(mockPrintResults).toHaveBeenCalledWith(report.results);
      expect(mockPrintSummary).toHaveBeenCalledWith(report);
      expect(mockShowOutro).toHaveBeenCalledWith('Done');
    });

    it('shows singular "check" when total is 1', async () => {
      const report = makeReport(1);
      mockRunChecks.mockResolvedValue(report);

      await checkCommand({});

      expect(mockSpinnerStop).toHaveBeenCalledWith('Completed 1 check');
    });

    it('shows plural "checks" when total is not 1', async () => {
      const report = makeReport(3);
      mockRunChecks.mockResolvedValue(report);

      await checkCommand({});

      expect(mockSpinnerStop).toHaveBeenCalledWith('Completed 3 checks');
    });
  });

  // ── Exit codes ──────────────────────────────────────────────────────────
  describe('exit codes', () => {
    it('returns 0 when no errors', async () => {
      mockRunChecks.mockResolvedValue(makeReport(0));
      const result = await checkCommand({});
      expect(result).toBe(0);
    });

    it('returns 1 when errors found', async () => {
      mockRunChecks.mockResolvedValue(makeReport(2));
      const result = await checkCommand({});
      expect(result).toBe(1);
    });

    it('returns 0 in JSON mode when no errors', async () => {
      mockRunChecks.mockResolvedValue(makeReport(0));
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await checkCommand({ json: true });
      expect(result).toBe(0);
      consoleSpy.mockRestore();
    });

    it('returns 1 in JSON mode when errors found', async () => {
      mockRunChecks.mockResolvedValue(makeReport(3));
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await checkCommand({ json: true });
      expect(result).toBe(1);
      consoleSpy.mockRestore();
    });
  });

  // ── Category / severity forwarding ────────────────────────────────────
  describe('options forwarding', () => {
    it('passes categories to runChecks when provided', async () => {
      mockRunChecks.mockResolvedValue(makeReport(0));
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await checkCommand({ json: true }, ['dockerfile', 'compose']);

      expect(mockRunChecks).toHaveBeenCalledWith(mockContext, {
        categories: ['dockerfile', 'compose'],
        minSeverity: undefined,
      });

      consoleSpy.mockRestore();
    });

    it('passes severity option to runChecks', async () => {
      mockRunChecks.mockResolvedValue(makeReport(0));
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await checkCommand({ json: true, severity: 'warning' });

      expect(mockRunChecks).toHaveBeenCalledWith(mockContext, {
        categories: undefined,
        minSeverity: 'warning',
      });

      consoleSpy.mockRestore();
    });

    it('passes file and composefile options to buildContext', async () => {
      mockRunChecks.mockResolvedValue(makeReport(0));
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await checkCommand({ json: true, file: '/custom/Dockerfile', composefile: '/custom/compose.yml' });

      expect(mockBuildContext).toHaveBeenCalledWith(process.cwd(), {
        dockerfilePath: '/custom/Dockerfile',
        composePath: '/custom/compose.yml',
      });

      consoleSpy.mockRestore();
    });
  });

  // ── Fix handling ──────────────────────────────────────────────────────
  describe('fix handling', () => {
    it('calls autoApplyFixes when --fix flag is set', async () => {
      const report = makeReport(2, 2);
      mockRunChecks.mockResolvedValue(report);
      mockAutoApplyFixes.mockResolvedValue(2);

      await checkCommand({ fix: true });

      expect(mockAutoApplyFixes).toHaveBeenCalledWith(report.results);
      expect(mockPromptFixes).not.toHaveBeenCalled();
      expect(mockShowOutro).toHaveBeenCalledWith('Applied 2 fixes');
    });

    it('calls autoApplyFixes with singular message when 1 fix applied', async () => {
      const report = makeReport(1, 1);
      mockRunChecks.mockResolvedValue(report);
      mockAutoApplyFixes.mockResolvedValue(1);

      await checkCommand({ fix: true });

      expect(mockShowOutro).toHaveBeenCalledWith('Applied 1 fix');
    });

    it('shows "Done" when --fix applies 0 fixes', async () => {
      const report = makeReport(1, 1);
      mockRunChecks.mockResolvedValue(report);
      mockAutoApplyFixes.mockResolvedValue(0);

      await checkCommand({ fix: true });

      expect(mockShowOutro).toHaveBeenCalledWith('Done');
    });

    it('calls promptFixes when fixable results exist and --fix is not set', async () => {
      const report = makeReport(2, 1);
      mockRunChecks.mockResolvedValue(report);
      mockPromptFixes.mockResolvedValue(1);

      await checkCommand({});

      expect(mockPromptFixes).toHaveBeenCalledWith(report.results);
      expect(mockAutoApplyFixes).not.toHaveBeenCalled();
      expect(mockShowOutro).toHaveBeenCalledWith('Applied 1 fix');
    });

    it('shows "Done" when promptFixes applies 0 fixes', async () => {
      const report = makeReport(2, 1);
      mockRunChecks.mockResolvedValue(report);
      mockPromptFixes.mockResolvedValue(0);

      await checkCommand({});

      expect(mockShowOutro).toHaveBeenCalledWith('Done');
    });

    it('does not call promptFixes or autoApplyFixes when no fixable results', async () => {
      const report = makeReport(2, 0);
      mockRunChecks.mockResolvedValue(report);

      await checkCommand({});

      expect(mockPromptFixes).not.toHaveBeenCalled();
      expect(mockAutoApplyFixes).not.toHaveBeenCalled();
      expect(mockShowOutro).toHaveBeenCalledWith('Done');
    });
  });
});
