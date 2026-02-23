import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { CheckResult, Fix } from '../../../src/types/index.js';

const mockConfirm = vi.fn();
const mockIsCancel = vi.fn().mockReturnValue(false);
vi.mock('@clack/prompts', () => ({
  confirm: mockConfirm,
  isCancel: mockIsCancel,
}));

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

describe('prompts', () => {
  let promptFixes: typeof import('../../../src/ui/prompts.js').promptFixes;
  let autoApplyFixes: typeof import('../../../src/ui/prompts.js').autoApplyFixes;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import('../../../src/ui/prompts.js');
    promptFixes = mod.promptFixes;
    autoApplyFixes = mod.autoApplyFixes;
  });

  function allOutput(): string {
    return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
  }

  describe('autoApplyFixes', () => {
    it('should return 0 for empty results', async () => {
      const count = await autoApplyFixes([]);
      expect(count).toBe(0);
    });

    it('should return 0 for results with no fixes', async () => {
      const results = [makeResult({ fixes: [] })];
      const count = await autoApplyFixes(results);
      expect(count).toBe(0);
    });

    it('should apply auto fixes and count successes', async () => {
      const applyFn = vi.fn().mockResolvedValue(true);
      const results = [
        makeResult({
          fixes: [
            { description: 'Auto fix', type: 'auto', apply: applyFn },
          ],
        }),
      ];

      const count = await autoApplyFixes(results);

      expect(count).toBe(1);
      expect(applyFn).toHaveBeenCalledTimes(1);
    });

    it('should skip manual fixes — only calls apply on type=auto', async () => {
      const autoApply = vi.fn().mockResolvedValue(true);
      const results = [
        makeResult({
          fixes: [
            { description: 'Manual fix', type: 'manual', instructions: 'Do it yourself' },
            { description: 'Auto fix', type: 'auto', apply: autoApply },
          ],
        }),
      ];

      const count = await autoApplyFixes(results);

      expect(count).toBe(1);
      expect(autoApply).toHaveBeenCalledTimes(1);
    });

    it('should handle fix.apply() throwing error without propagating', async () => {
      const throwingApply = vi.fn().mockRejectedValue(new Error('Boom'));
      const successApply = vi.fn().mockResolvedValue(true);
      const results = [
        makeResult({
          fixes: [
            { description: 'Throws', type: 'auto', apply: throwingApply },
            { description: 'Works', type: 'auto', apply: successApply },
          ],
        }),
      ];

      const count = await autoApplyFixes(results);

      expect(count).toBe(1);
      expect(throwingApply).toHaveBeenCalledTimes(1);
      expect(successApply).toHaveBeenCalledTimes(1);
    });

    it('should handle fix.apply() returning false — not counted as applied', async () => {
      const failApply = vi.fn().mockResolvedValue(false);
      const results = [
        makeResult({
          fixes: [
            { description: 'Fails', type: 'auto', apply: failApply },
          ],
        }),
      ];

      const count = await autoApplyFixes(results);

      expect(count).toBe(0);
      expect(failApply).toHaveBeenCalledTimes(1);
    });

    it('should apply all auto fixes across multiple results', async () => {
      const apply1 = vi.fn().mockResolvedValue(true);
      const apply2 = vi.fn().mockResolvedValue(true);
      const apply3 = vi.fn().mockResolvedValue(true);
      const results = [
        makeResult({
          id: 'r1',
          fixes: [
            { description: 'Fix 1', type: 'auto', apply: apply1 },
          ],
        }),
        makeResult({
          id: 'r2',
          fixes: [
            { description: 'Fix 2', type: 'auto', apply: apply2 },
            { description: 'Fix 3', type: 'auto', apply: apply3 },
          ],
        }),
      ];

      const count = await autoApplyFixes(results);

      expect(count).toBe(3);
      expect(apply1).toHaveBeenCalledTimes(1);
      expect(apply2).toHaveBeenCalledTimes(1);
      expect(apply3).toHaveBeenCalledTimes(1);
    });
  });

  describe('promptFixes', () => {
    it('should return 0 for no fixable results', async () => {
      const results = [makeResult({ fixes: [] })];

      const count = await promptFixes(results);

      expect(count).toBe(0);
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('should return 0 when user declines initial review prompt', async () => {
      mockConfirm.mockResolvedValueOnce(false);
      const results = [
        makeResult({
          fixes: [{ description: 'Fix it', type: 'auto', apply: vi.fn().mockResolvedValue(true) }],
        }),
      ];

      const count = await promptFixes(results);

      expect(count).toBe(0);
      expect(mockConfirm).toHaveBeenCalledTimes(1);
    });

    it('should return 0 when user cancels initial prompt', async () => {
      mockConfirm.mockResolvedValueOnce(Symbol('cancel'));
      mockIsCancel.mockReturnValueOnce(true);
      const results = [
        makeResult({
          fixes: [{ description: 'Fix it', type: 'auto', apply: vi.fn().mockResolvedValue(true) }],
        }),
      ];

      const count = await promptFixes(results);

      expect(count).toBe(0);
    });

    it('should apply fix when user confirms both initial and per-fix prompts', async () => {
      const applyFn = vi.fn().mockResolvedValue(true);
      // First confirm: "review fixes?" -> true
      // Second confirm: "apply this fix?" -> true
      mockConfirm
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      const results = [
        makeResult({
          fixes: [{ description: 'Fix it', type: 'auto', apply: applyFn }],
        }),
      ];

      const count = await promptFixes(results);

      expect(count).toBe(1);
      expect(applyFn).toHaveBeenCalledTimes(1);
      expect(mockConfirm).toHaveBeenCalledTimes(2);
    });

    it('should skip fix when user declines individual fix', async () => {
      const applyFn = vi.fn().mockResolvedValue(true);
      // First confirm: "review fixes?" -> true
      // Second confirm: "apply this fix?" -> false
      mockConfirm
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const results = [
        makeResult({
          fixes: [{ description: 'Fix it', type: 'auto', apply: applyFn }],
        }),
      ];

      const count = await promptFixes(results);

      expect(count).toBe(0);
      expect(applyFn).not.toHaveBeenCalled();
    });

    it('should show manual fix instructions via console.log', async () => {
      // First confirm: "review fixes?" -> true
      mockConfirm.mockResolvedValueOnce(true);

      const results = [
        makeResult({
          fixes: [
            {
              description: 'Manual fix description',
              type: 'manual',
              instructions: 'Step-by-step instructions here',
            },
          ],
        }),
      ];

      await promptFixes(results);

      const output = allOutput();
      expect(output).toContain('Manual fix');
      expect(output).toContain('Manual fix description');
      expect(output).toContain('Step-by-step instructions here');
    });
  });
});
