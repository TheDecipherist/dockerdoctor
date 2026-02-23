import { describe, it, expect } from 'vitest';
import {
  registerCheck,
  getAllChecks,
  getChecksByCategory,
  getStaticChecks,
  getRuntimeChecks,
} from '../../src/checks/registry.js';
import type { Check, CheckContext, CheckResult } from '../../src/types/index.js';

// Side-effect import to register all 23 checks
import '../../src/checks/index.js';

describe('registry', () => {
  // --- registerCheck ---
  describe('registerCheck()', () => {
    it('should throw an error when registering a duplicate check ID', () => {
      // All checks are already registered via the side-effect import above.
      // Attempting to re-register an existing ID should throw.
      expect(() => {
        registerCheck({
          id: 'dockerfile.layer-order',
          name: 'Duplicate Test',
          category: 'dockerfile',
          requiresDocker: false,
          async run(): Promise<CheckResult[]> {
            return [];
          },
        });
      }).toThrow('Duplicate check ID: dockerfile.layer-order');
    });

    it('should successfully register a check with a unique ID', () => {
      const uniqueCheck: Check = {
        id: 'test.registry-unique-check-1',
        name: 'Unique Registry Test Check',
        category: 'dockerfile',
        requiresDocker: false,
        async run(): Promise<CheckResult[]> {
          return [];
        },
      };

      // Should not throw
      expect(() => registerCheck(uniqueCheck)).not.toThrow();

      // Should now appear in getAllChecks
      const all = getAllChecks();
      expect(all.some((c) => c.id === 'test.registry-unique-check-1')).toBe(true);
    });

    it('should throw when re-registering the newly registered unique check', () => {
      expect(() => {
        registerCheck({
          id: 'test.registry-unique-check-1',
          name: 'Duplicate of Unique',
          category: 'dockerfile',
          requiresDocker: false,
          async run(): Promise<CheckResult[]> {
            return [];
          },
        });
      }).toThrow('Duplicate check ID: test.registry-unique-check-1');
    });
  });

  // --- getAllChecks ---
  describe('getAllChecks()', () => {
    it('should return an array', () => {
      const all = getAllChecks();
      expect(Array.isArray(all)).toBe(true);
    });

    it('should return all registered checks (25 static + 25 runtime + 1 test check)', () => {
      const all = getAllChecks();
      // 25 static + 25 runtime (4 build + 4 startup + 4 network + 4 perf + 4 image + 5 cleanup) + 1 test
      expect(all.length).toBe(51);
    });

    it('should return a copy — mutating the returned array does not affect internal state', () => {
      const first = getAllChecks();
      const originalLength = first.length;

      // Mutate the returned array
      first.push({
        id: 'test.fake-mutation',
        name: 'Fake',
        category: 'dockerfile',
        requiresDocker: false,
        async run(): Promise<CheckResult[]> {
          return [];
        },
      });

      // The internal registry should not be affected
      const second = getAllChecks();
      expect(second.length).toBe(originalLength);
    });

    it('should include known check IDs from each category', () => {
      const all = getAllChecks();
      const ids = all.map((c) => c.id);

      // Spot-check a few known IDs from different categories
      expect(ids).toContain('dockerfile.layer-order');
      expect(ids).toContain('compose.static-ip');
      expect(ids).toContain('secrets.dockerfile-env');
      expect(ids).toContain('lineendings.crlf');
      expect(ids).toContain('dockerignore.missing');
    });
  });

  // --- getChecksByCategory ---
  describe('getChecksByCategory()', () => {
    it('should return 9 dockerfile checks', () => {
      const checks = getChecksByCategory('dockerfile');
      // 9 built-in + 1 test check registered above with category 'dockerfile'
      expect(checks.length).toBe(10);
      checks.forEach((c) => expect(c.category).toBe('dockerfile'));
    });

    it('should return 7 compose checks', () => {
      const checks = getChecksByCategory('compose');
      expect(checks.length).toBe(7);
      checks.forEach((c) => expect(c.category).toBe('compose'));
    });

    it('should return 4 secrets checks', () => {
      const checks = getChecksByCategory('secrets');
      expect(checks.length).toBe(4);
      checks.forEach((c) => expect(c.category).toBe('secrets'));
    });

    it('should return 3 lineendings checks', () => {
      const checks = getChecksByCategory('lineendings');
      expect(checks.length).toBe(3);
      checks.forEach((c) => expect(c.category).toBe('lineendings'));
    });

    it('should return 2 dockerignore checks', () => {
      const checks = getChecksByCategory('dockerignore');
      expect(checks.length).toBe(2);
      checks.forEach((c) => expect(c.category).toBe('dockerignore'));
    });

    it('should return 4 build checks', () => {
      const checks = getChecksByCategory('build');
      expect(checks.length).toBe(4);
      checks.forEach((c) => expect(c.category).toBe('build'));
    });

    it('should return 4 startup checks', () => {
      const checks = getChecksByCategory('startup');
      expect(checks.length).toBe(4);
      checks.forEach((c) => expect(c.category).toBe('startup'));
    });

    it('should return 4 network checks', () => {
      const checks = getChecksByCategory('network');
      expect(checks.length).toBe(4);
      checks.forEach((c) => expect(c.category).toBe('network'));
    });

    it('should return 4 performance checks', () => {
      const checks = getChecksByCategory('performance');
      expect(checks.length).toBe(4);
      checks.forEach((c) => expect(c.category).toBe('performance'));
    });

    it('should return 4 image checks', () => {
      const checks = getChecksByCategory('image');
      expect(checks.length).toBe(4);
      checks.forEach((c) => expect(c.category).toBe('image'));
    });

    it('should return 5 cleanup checks', () => {
      const checks = getChecksByCategory('cleanup');
      expect(checks.length).toBe(5);
      checks.forEach((c) => expect(c.category).toBe('cleanup'));
    });
  });

  // --- getStaticChecks ---
  describe('getStaticChecks()', () => {
    it('should return only checks with requiresDocker=false', () => {
      const staticChecks = getStaticChecks();
      staticChecks.forEach((c) => {
        expect(c.requiresDocker).toBe(false);
      });
    });

    it('should return 26 static checks (25 built-in + 1 test)', () => {
      const staticChecks = getStaticChecks();
      // 25 built-in static + 1 test check = 26 (the 8 runtime checks are excluded)
      expect(staticChecks.length).toBe(26);
    });
  });

  // --- getRuntimeChecks ---
  describe('getRuntimeChecks()', () => {
    it('should return only checks with requiresDocker=true', () => {
      const runtimeChecks = getRuntimeChecks();
      runtimeChecks.forEach((c) => {
        expect(c.requiresDocker).toBe(true);
      });
    });

    it('should return 25 runtime checks (4 build + 4 startup + 4 network + 4 perf + 4 image + 5 cleanup)', () => {
      const runtimeChecks = getRuntimeChecks();
      expect(runtimeChecks.length).toBe(25);
    });
  });
});
