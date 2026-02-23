import { describe, it, expect, beforeAll } from 'vitest';
import { parseDockerignore } from '../../../src/parsers/dockerignore.js';
import { getChecksByCategory } from '../../../src/checks/registry.js';
import type { CheckContext, Check, ParsedDockerignore } from '../../../src/types/index.js';

// Side-effect import to register all dockerignore checks
import '../../../src/checks/dockerignore/index.js';

function makeContext(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    cwd: '/test',
    dockerAvailable: false,
    files: {
      shellScripts: [],
    },
    ...overrides,
  };
}

function findCheck(id: string): Check {
  const checks = getChecksByCategory('dockerignore');
  const check = checks.find((c) => c.id === id);
  if (!check) throw new Error(`Check "${id}" not found. Available: ${checks.map((c) => c.id).join(', ')}`);
  return check;
}

describe('dockerignore checks', () => {
  let checks: Check[];

  beforeAll(() => {
    checks = getChecksByCategory('dockerignore');
  });

  it('should have all 2 dockerignore checks registered', () => {
    expect(checks.length).toBe(2);
  });

  // --- dockerignore.missing ---
  describe('dockerignore.missing', () => {
    const check = findCheck('dockerignore.missing');

    it('should flag when no .dockerignore exists', async () => {
      const ctx = makeContext({
        dockerignore: undefined,
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerignore.missing');
      expect(results[0].severity).toBe('warning');
    });

    it('should not flag when .dockerignore exists', async () => {
      const dockerignore = parseDockerignore('node_modules\n.git\n', '/test/.dockerignore');
      const ctx = makeContext({ dockerignore });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should have an auto-fix function', async () => {
      const ctx = makeContext({
        dockerignore: undefined,
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      const autoFix = results[0].fixes.find((f) => f.type === 'auto');
      expect(autoFix).toBeDefined();
      expect(autoFix!.apply).toBeDefined();
      expect(typeof autoFix!.apply).toBe('function');
    });

    it('should also have a manual fix', async () => {
      const ctx = makeContext({
        dockerignore: undefined,
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      const manualFix = results[0].fixes.find((f) => f.type === 'manual');
      expect(manualFix).toBeDefined();
      expect(manualFix!.instructions).toBeDefined();
    });
  });

  // --- dockerignore.missing-entries ---
  describe('dockerignore.missing-entries', () => {
    const check = findCheck('dockerignore.missing-entries');

    it('should flag missing common entries', async () => {
      // Only has one entry, missing node_modules, .git, .env, .npm, dist, coverage
      const dockerignore = parseDockerignore('*.log\n', '/test/.dockerignore');
      const ctx = makeContext({ dockerignore });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerignore.missing-entries');
      expect(results[0].severity).toBe('warning');
      expect((results[0].meta?.missingEntries as string[]).length).toBeGreaterThan(0);
    });

    it('should not flag when all recommended entries are present', async () => {
      const raw = `node_modules
.git
.env
.npm
dist
coverage
`;
      const dockerignore = parseDockerignore(raw, '/test/.dockerignore');
      const ctx = makeContext({ dockerignore });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should return empty if no dockerignore', async () => {
      const ctx = makeContext({
        dockerignore: undefined,
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should detect partially missing entries', async () => {
      const raw = `node_modules
.git
`;
      const dockerignore = parseDockerignore(raw, '/test/.dockerignore');
      const ctx = makeContext({ dockerignore });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      const missing = results[0].meta?.missingEntries as string[];
      expect(missing).toContain('.env');
      expect(missing).toContain('.npm');
      expect(missing).toContain('dist');
      expect(missing).toContain('coverage');
      // These are already present, so should NOT be in missing
      expect(missing).not.toContain('node_modules');
      expect(missing).not.toContain('.git');
    });

    it('should match entries with trailing slash', async () => {
      const raw = `node_modules/
.git/
.env
.npm/
dist/
coverage/
`;
      const dockerignore = parseDockerignore(raw, '/test/.dockerignore');
      const ctx = makeContext({ dockerignore });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should have an auto-fix function', async () => {
      const dockerignore = parseDockerignore('*.log\n', '/test/.dockerignore');
      const ctx = makeContext({ dockerignore });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      const autoFix = results[0].fixes.find((f) => f.type === 'auto');
      expect(autoFix).toBeDefined();
      expect(autoFix!.apply).toBeDefined();
      expect(typeof autoFix!.apply).toBe('function');
    });
  });
});
