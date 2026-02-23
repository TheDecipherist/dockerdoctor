import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mock checkCommand ───────────────────────────────────────────────────────
const mockCheckCommand = vi.fn().mockResolvedValue(0);

vi.mock('../../../src/commands/check.js', () => ({
  checkCommand: mockCheckCommand,
}));

// Side-effect-only import; prevent real check registration
vi.mock('../../../src/checks/index.js', () => ({}));

// ── Dynamic imports (after mocks are wired) ─────────────────────────────────
const { dockerfileCommand } = await import('../../../src/commands/dockerfile.js');
const { composeCommand } = await import('../../../src/commands/compose.js');
const { secretsCommand } = await import('../../../src/commands/secrets.js');
const { lineendingsCommand } = await import('../../../src/commands/lineendings.js');
const { buildCommand } = await import('../../../src/commands/build.js');
const { startupCommand } = await import('../../../src/commands/startup.js');
const { networkCommand } = await import('../../../src/commands/network.js');
const { perfCommand } = await import('../../../src/commands/perf.js');
const { imageCommand } = await import('../../../src/commands/image.js');
const { cleanupCommand } = await import('../../../src/commands/cleanup.js');

// ── Subcommand mapping ──────────────────────────────────────────────────────
const subcommands = [
  { name: 'dockerfileCommand', fn: dockerfileCommand, category: 'dockerfile' },
  { name: 'composeCommand', fn: composeCommand, category: 'compose' },
  { name: 'secretsCommand', fn: secretsCommand, category: 'secrets' },
  { name: 'lineendingsCommand', fn: lineendingsCommand, category: 'lineendings' },
  { name: 'buildCommand', fn: buildCommand, category: 'build' },
  { name: 'startupCommand', fn: startupCommand, category: 'startup' },
  { name: 'networkCommand', fn: networkCommand, category: 'network' },
  { name: 'perfCommand', fn: perfCommand, category: 'performance' },
  { name: 'imageCommand', fn: imageCommand, category: 'image' },
  { name: 'cleanupCommand', fn: cleanupCommand, category: 'cleanup' },
] as const;

// ── Tests ───────────────────────────────────────────────────────────────────
describe('subcommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCommand.mockResolvedValue(0);
  });

  for (const { name, fn, category } of subcommands) {
    describe(name, () => {
      it(`delegates to checkCommand with ['${category}'] category`, async () => {
        const opts = { json: true, severity: 'warning' as const };
        await fn(opts);

        expect(mockCheckCommand).toHaveBeenCalledTimes(1);
        expect(mockCheckCommand).toHaveBeenCalledWith(opts, [category]);
      });

      it('returns the exit code from checkCommand', async () => {
        mockCheckCommand.mockResolvedValue(0);
        const successResult = await fn({});
        expect(successResult).toBe(0);

        mockCheckCommand.mockResolvedValue(1);
        const failResult = await fn({});
        expect(failResult).toBe(1);
      });
    });
  }
});
