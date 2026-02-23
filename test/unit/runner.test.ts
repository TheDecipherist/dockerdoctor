import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock docker layer so runtime checks don't actually call Docker
vi.mock('../../src/docker/exec.js', () => ({
  dockerExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 }),
  dockerBuildContextSize: vi.fn().mockResolvedValue({ stdout: '1024\t.', stderr: '', exitCode: 0 }),
  dockerSystemDf: vi.fn().mockResolvedValue({ stdout: '{}', stderr: '', exitCode: 0 }),
  dockerStats: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  dockerInspect: vi.fn().mockResolvedValue({ stdout: '{}', stderr: '', exitCode: 0 }),
  dockerLogs: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  dockerImageHistory: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  dockerNetworkInspect: vi.fn().mockResolvedValue({ stdout: '[]', stderr: '', exitCode: 0 }),
  dockerPortCheck: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 }),
}));

vi.mock('../../src/docker/client.js', () => ({
  getClient: vi.fn().mockReturnValue({}),
  resetClient: vi.fn(),
  ping: vi.fn().mockResolvedValue(true),
  listContainers: vi.fn().mockResolvedValue([]),
  listImages: vi.fn().mockResolvedValue([]),
  listVolumes: vi.fn().mockResolvedValue([]),
  listNetworks: vi.fn().mockResolvedValue([]),
  inspectContainer: vi.fn().mockResolvedValue({}),
  getContainerLogs: vi.fn().mockResolvedValue(''),
  getDiskUsage: vi.fn().mockResolvedValue({ containers: 0, images: 0, volumes: 0, buildCache: 0, total: 0 }),
}));

import { runChecks } from '../../src/runner.js';
import { registerCheck, getAllChecks, getChecksByCategory } from '../../src/checks/registry.js';
import { parseDockerfile } from '../../src/parsers/dockerfile.js';
import { parseCompose } from '../../src/parsers/compose.js';
import type { CheckContext, CheckResult, Check, Report } from '../../src/types/index.js';

// Side-effect import to register all checks (static + runtime)
import '../../src/checks/index.js';

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

describe('runChecks()', () => {
  // Register a throwing check once before all tests to avoid duplicate ID errors
  beforeAll(() => {
    try {
      registerCheck({
        id: 'test.throwing-check',
        name: 'Throwing Test Check',
        category: 'dockerfile',
        requiresDocker: false,
        async run(): Promise<CheckResult[]> {
          throw new Error('Intentional test explosion');
        },
      });
    } catch {
      // Already registered from a previous run (e.g., registry.test.ts in same suite)
    }
  });

  it('should return results when given a Dockerfile with issues', async () => {
    // A Dockerfile that uses latest tag (should trigger base-image-latest check)
    const raw = `FROM node:latest
RUN npm install
COPY . .
CMD node index.js
`;
    const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
    const ctx = makeContext({
      dockerfile,
      files: { dockerfilePath: '/test/Dockerfile', shellScripts: [] },
    });

    const report = await runChecks(ctx);

    expect(report.results.length).toBeGreaterThan(0);
    // At least the base-image-latest check should fire
    const latestTagResults = report.results.filter(
      (r) => r.id === 'dockerfile.base-image-latest',
    );
    expect(latestTagResults.length).toBeGreaterThanOrEqual(1);
  });

  it('should return a valid report structure with minimal empty context', async () => {
    const ctx = makeContext();

    const report = await runChecks(ctx);

    // Verify report shape
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('version');
    expect(report).toHaveProperty('dockerAvailable');
    expect(report).toHaveProperty('results');
    expect(report).toHaveProperty('summary');

    // Verify types
    expect(typeof report.timestamp).toBe('string');
    expect(typeof report.version).toBe('string');
    expect(typeof report.dockerAvailable).toBe('boolean');
    expect(Array.isArray(report.results)).toBe(true);

    // Verify summary shape
    expect(report.summary).toHaveProperty('total');
    expect(report.summary).toHaveProperty('errors');
    expect(report.summary).toHaveProperty('warnings');
    expect(report.summary).toHaveProperty('info');
    expect(report.summary).toHaveProperty('fixable');

    // Verify timestamp is valid ISO string
    expect(() => new Date(report.timestamp)).not.toThrow();
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
  });

  it('should filter results by category when categories option is provided', async () => {
    // Create a Dockerfile with issues to get dockerfile-category results
    const raw = `FROM node:latest
RUN npm install
CMD node index.js
`;
    const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
    const ctx = makeContext({
      dockerfile,
      files: { dockerfilePath: '/test/Dockerfile', shellScripts: [] },
    });

    const report = await runChecks(ctx, { categories: ['dockerfile'] });

    // All results should be from dockerfile category (or the test throwing check
    // which is also in 'dockerfile' category, which would appear as info)
    report.results.forEach((r) => {
      expect(r.category).toBe('dockerfile');
    });

    // Should NOT include compose, secrets, lineendings, or dockerignore results
    const nonDockerfile = report.results.filter(
      (r) => r.category !== 'dockerfile',
    );
    expect(nonDockerfile.length).toBe(0);
  });

  it('should filter results by minSeverity — only errors when severity is "error"', async () => {
    // Create a Dockerfile likely to produce both errors and warnings
    const raw = `FROM node:latest
RUN npm install
COPY . .
CMD node index.js
`;
    const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
    const ctx = makeContext({
      dockerfile,
      files: { dockerfilePath: '/test/Dockerfile', shellScripts: [] },
    });

    const report = await runChecks(ctx, { minSeverity: 'error' });

    // Every result should be an error (no warnings or info)
    report.results.forEach((r) => {
      expect(r.severity).toBe('error');
    });
  });

  it('should filter results by minSeverity — warnings and errors when severity is "warning"', async () => {
    const raw = `FROM node:latest
RUN npm install
CMD node index.js
`;
    const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
    const ctx = makeContext({
      dockerfile,
      files: { dockerfilePath: '/test/Dockerfile', shellScripts: [] },
    });

    const report = await runChecks(ctx, { minSeverity: 'warning' });

    // Every result should be error or warning (no info)
    report.results.forEach((r) => {
      expect(['error', 'warning']).toContain(r.severity);
    });
  });

  it('should call onCheckStart and onCheckComplete callbacks', async () => {
    const ctx = makeContext();

    const startedChecks: string[] = [];
    const completedChecks: string[] = [];

    await runChecks(ctx, {
      onCheckStart: (check: Check) => {
        startedChecks.push(check.id);
      },
      onCheckComplete: (check: Check, results: CheckResult[]) => {
        completedChecks.push(check.id);
      },
    });

    // Both arrays should contain the same check IDs
    expect(startedChecks.length).toBeGreaterThan(0);
    expect(completedChecks.length).toBeGreaterThan(0);
    expect(startedChecks.length).toBe(completedChecks.length);

    // Every started check should also be completed
    for (const id of startedChecks) {
      expect(completedChecks).toContain(id);
    }
  });

  it('should catch a throwing check and convert it to an info-level result', async () => {
    const ctx = makeContext();

    // Run only dockerfile checks, which includes our test.throwing-check
    const report = await runChecks(ctx, { categories: ['dockerfile'] });

    // Find the result from our throwing check
    const throwResult = report.results.find(
      (r) => r.id === 'test.throwing-check',
    );
    expect(throwResult).toBeDefined();
    expect(throwResult!.severity).toBe('info');
    expect(throwResult!.title).toContain('Check failed');
    expect(throwResult!.title).toContain('Throwing Test Check');
    expect(throwResult!.message).toBe('Intentional test explosion');
    expect(throwResult!.category).toBe('dockerfile');
    expect(throwResult!.fixes).toEqual([]);
  });

  it('should skip runtime checks when dockerAvailable is false', async () => {
    // Register a runtime check with a unique ID for this test
    let runtimeCheckRan = false;
    try {
      registerCheck({
        id: 'test.runner-runtime-check',
        name: 'Runtime Test Check',
        category: 'build',
        requiresDocker: true,
        async run(): Promise<CheckResult[]> {
          runtimeCheckRan = true;
          return [
            {
              id: 'test.runner-runtime-check',
              title: 'Runtime result',
              severity: 'info',
              category: 'build',
              message: 'This should not appear',
              fixes: [],
            },
          ];
        },
      });
    } catch {
      // Already registered
    }

    const ctx = makeContext({ dockerAvailable: false });
    const report = await runChecks(ctx);

    // The runtime check should not have been executed
    const runtimeResult = report.results.find(
      (r) => r.id === 'test.runner-runtime-check',
    );
    expect(runtimeResult).toBeUndefined();
  });

  it('should include runtime checks when dockerAvailable is true', async () => {
    // We already registered test.runner-runtime-check above.
    // With dockerAvailable=true, it should run.
    const ctx = makeContext({ dockerAvailable: true });
    const report = await runChecks(ctx, { categories: ['build'] });

    const runtimeResult = report.results.find(
      (r) => r.id === 'test.runner-runtime-check',
    );
    expect(runtimeResult).toBeDefined();
    expect(runtimeResult!.message).toBe('This should not appear');
  });

  it('should have correct summary counts', async () => {
    const raw = `FROM node:latest
RUN npm install
COPY . .
CMD node index.js
`;
    const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
    const ctx = makeContext({
      dockerfile,
      files: { dockerfilePath: '/test/Dockerfile', shellScripts: [] },
    });

    const report = await runChecks(ctx);

    // Verify summary total matches results length
    expect(report.summary.total).toBe(report.results.length);

    // Verify individual severity counts add up to total
    const countErrors = report.results.filter(
      (r) => r.severity === 'error',
    ).length;
    const countWarnings = report.results.filter(
      (r) => r.severity === 'warning',
    ).length;
    const countInfo = report.results.filter(
      (r) => r.severity === 'info',
    ).length;

    expect(report.summary.errors).toBe(countErrors);
    expect(report.summary.warnings).toBe(countWarnings);
    expect(report.summary.info).toBe(countInfo);
    expect(report.summary.errors + report.summary.warnings + report.summary.info).toBe(
      report.summary.total,
    );

    // Verify fixable count
    const countFixable = report.results.filter(
      (r) => r.fixes.length > 0,
    ).length;
    expect(report.summary.fixable).toBe(countFixable);
  });

  it('should return version string in the report', async () => {
    const ctx = makeContext();
    const report = await runChecks(ctx);

    // Version should be a valid semver-like string
    expect(report.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should handle compose with issues and produce results', async () => {
    const composeRaw = `services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
    networks:
      custom_net:
        ipv4_address: 172.20.0.10
networks:
  custom_net:
    driver: bridge
`;
    const compose = parseCompose(composeRaw, '/test/docker-compose.yml');
    const ctx = makeContext({
      compose,
      files: { composePath: '/test/docker-compose.yml', shellScripts: [] },
    });

    const report = await runChecks(ctx, { categories: ['compose'] });

    // Should produce at least one result (static-ip check should fire)
    expect(report.results.length).toBeGreaterThan(0);
    const staticIpResults = report.results.filter(
      (r) => r.id === 'compose.static-ip',
    );
    expect(staticIpResults.length).toBeGreaterThanOrEqual(1);
  });

  it('should produce no results for an empty context with minSeverity=error', async () => {
    const ctx = makeContext();

    // With no files and minSeverity=error, most checks should return empty
    // (except the throwing check which produces info, but that gets filtered)
    const report = await runChecks(ctx, { minSeverity: 'error' });

    // All results must be errors
    report.results.forEach((r) => {
      expect(r.severity).toBe('error');
    });
  });

  it('should reflect dockerAvailable in the report', async () => {
    const ctxTrue = makeContext({ dockerAvailable: true });
    const ctxFalse = makeContext({ dockerAvailable: false });

    const reportTrue = await runChecks(ctxTrue, { categories: ['dockerfile'] });
    const reportFalse = await runChecks(ctxFalse, {
      categories: ['dockerfile'],
    });

    expect(reportTrue.dockerAvailable).toBe(true);
    expect(reportFalse.dockerAvailable).toBe(false);
  });
});
