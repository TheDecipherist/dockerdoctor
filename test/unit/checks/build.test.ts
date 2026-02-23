import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CheckContext, Check } from '../../../src/types/index.js';

// Mock docker modules BEFORE importing checks
vi.mock('../../../src/docker/client.js', () => ({
  listContainers: vi.fn(),
  listImages: vi.fn(),
  listNetworks: vi.fn(),
  listVolumes: vi.fn(),
  inspectContainer: vi.fn(),
  getContainerLogs: vi.fn(),
  getDiskUsage: vi.fn(),
}));

vi.mock('../../../src/docker/exec.js', () => ({
  dockerExec: vi.fn(),
  dockerBuildContextSize: vi.fn(),
  dockerStats: vi.fn(),
  dockerInspect: vi.fn(),
  dockerImageHistory: vi.fn(),
  dockerSystemDf: vi.fn(),
  dockerLogs: vi.fn(),
  dockerNetworkInspect: vi.fn(),
  dockerPortCheck: vi.fn(),
}));

// Import mocked modules to set return values
const { getDiskUsage } = await import('../../../src/docker/client.js');
const { dockerExec, dockerBuildContextSize } = await import('../../../src/docker/exec.js');

// NOW import the checks (triggers registration)
await import('../../../src/checks/build/index.js');

import { getChecksByCategory } from '../../../src/checks/registry.js';

function makeContext(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    cwd: '/test/project',
    dockerAvailable: true,
    files: { shellScripts: [] },
    ...overrides,
  };
}

function findCheck(checks: Check[], id: string): Check {
  const check = checks.find((c) => c.id === id);
  if (!check) throw new Error(`Check not found: ${id}`);
  return check;
}

describe('build checks', () => {
  let checks: Check[];

  beforeEach(() => {
    vi.resetAllMocks();
    checks = getChecksByCategory('build');
  });

  it('should have all 4 build checks registered', () => {
    expect(checks.length).toBe(4);
  });

  // --- build.context-size ---
  describe('build.context-size', () => {
    it('should return nothing for small context (<100 MB)', async () => {
      const check = findCheck(checks, 'build.context-size');
      vi.mocked(dockerBuildContextSize).mockResolvedValue(50 * 1024 * 1024); // 50 MB
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return warning for medium context (>100 MB, <500 MB)', async () => {
      const check = findCheck(checks, 'build.context-size');
      vi.mocked(dockerBuildContextSize).mockResolvedValue(200 * 1024 * 1024); // 200 MB
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('build.context-size');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.sizeMB).toBe(200);
    });

    it('should return error for large context (>500 MB)', async () => {
      const check = findCheck(checks, 'build.context-size');
      vi.mocked(dockerBuildContextSize).mockResolvedValue(600 * 1024 * 1024); // 600 MB
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('build.context-size');
      expect(results[0].severity).toBe('error');
      expect(results[0].meta?.sizeMB).toBe(600);
    });

    it('should return nothing when dockerBuildContextSize returns -1 (error)', async () => {
      const check = findCheck(checks, 'build.context-size');
      vi.mocked(dockerBuildContextSize).mockResolvedValue(-1);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing for context exactly at 100 MB boundary', async () => {
      const check = findCheck(checks, 'build.context-size');
      vi.mocked(dockerBuildContextSize).mockResolvedValue(100 * 1024 * 1024); // exactly 100 MB
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should use the cwd from context', async () => {
      const check = findCheck(checks, 'build.context-size');
      vi.mocked(dockerBuildContextSize).mockResolvedValue(10);
      const ctx = makeContext({ cwd: '/my/custom/path' });
      await check.run(ctx);
      expect(dockerBuildContextSize).toHaveBeenCalledWith('/my/custom/path');
    });
  });

  // --- build.dns-resolution ---
  describe('build.dns-resolution', () => {
    it('should return nothing when DNS resolves successfully (exitCode 0)', async () => {
      const check = findCheck(checks, 'build.dns-resolution');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'Name: registry-1.docker.io\nAddress: 54.225.0.1',
        stderr: '',
        exitCode: 0,
      });
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return error when DNS fails (exitCode non-zero)', async () => {
      const check = findCheck(checks, 'build.dns-resolution');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: '',
        stderr: 'nslookup: can\'t resolve \'registry-1.docker.io\'',
        exitCode: 1,
      });
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('build.dns-resolution');
      expect(results[0].severity).toBe('error');
      expect(results[0].meta?.exitCode).toBe(1);
    });

    it('should include stderr in error message when available', async () => {
      const check = findCheck(checks, 'build.dns-resolution');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: '',
        stderr: 'DNS timeout',
        exitCode: 2,
      });
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].message).toContain('DNS timeout');
    });

    it('should call dockerExec with correct nslookup arguments', async () => {
      const check = findCheck(checks, 'build.dns-resolution');
      vi.mocked(dockerExec).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const ctx = makeContext();
      await check.run(ctx);
      expect(dockerExec).toHaveBeenCalledWith(
        ['run', '--rm', 'alpine', 'nslookup', 'registry-1.docker.io'],
        { timeout: 30000 },
      );
    });
  });

  // --- build.disk-space ---
  describe('build.disk-space', () => {
    it('should return nothing for low disk usage (<20 GB)', async () => {
      const check = findCheck(checks, 'build.disk-space');
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 1 * 1024 * 1024 * 1024,
        images: 2 * 1024 * 1024 * 1024,
        volumes: 1 * 1024 * 1024 * 1024,
        buildCache: 1 * 1024 * 1024 * 1024,
        total: 5 * 1024 * 1024 * 1024, // 5 GB
      });
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return warning for high disk usage (>20 GB, <50 GB)', async () => {
      const check = findCheck(checks, 'build.disk-space');
      const total = 30 * 1024 * 1024 * 1024; // 30 GB
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 5 * 1024 * 1024 * 1024,
        images: 15 * 1024 * 1024 * 1024,
        volumes: 5 * 1024 * 1024 * 1024,
        buildCache: 5 * 1024 * 1024 * 1024,
        total,
      });
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('build.disk-space');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.totalBytes).toBe(total);
    });

    it('should return error for critically high disk usage (>50 GB)', async () => {
      const check = findCheck(checks, 'build.disk-space');
      const total = 60 * 1024 * 1024 * 1024; // 60 GB
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 10 * 1024 * 1024 * 1024,
        images: 30 * 1024 * 1024 * 1024,
        volumes: 10 * 1024 * 1024 * 1024,
        buildCache: 10 * 1024 * 1024 * 1024,
        total,
      });
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('build.disk-space');
      expect(results[0].severity).toBe('error');
    });

    it('should return nothing when getDiskUsage throws', async () => {
      const check = findCheck(checks, 'build.disk-space');
      vi.mocked(getDiskUsage).mockRejectedValue(new Error('Docker not available'));
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should include breakdown in meta', async () => {
      const check = findCheck(checks, 'build.disk-space');
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 5 * 1024 * 1024 * 1024,
        images: 10 * 1024 * 1024 * 1024,
        volumes: 3 * 1024 * 1024 * 1024,
        buildCache: 7 * 1024 * 1024 * 1024,
        total: 25 * 1024 * 1024 * 1024,
      });
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].meta?.imagesGB).toBeDefined();
      expect(results[0].meta?.containersGB).toBeDefined();
      expect(results[0].meta?.volumesGB).toBeDefined();
      expect(results[0].meta?.buildCacheGB).toBeDefined();
    });
  });

  // --- build.platform-mismatch ---
  describe('build.platform-mismatch', () => {
    it('should return warning when platform does not match host arch', async () => {
      const check = findCheck(checks, 'build.platform-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: 'FROM --platform=linux/arm64 node:20\n',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              {
                name: 'FROM',
                args: '--platform=linux/arm64 node:20',
                lineno: 1,
                raw: 'FROM --platform=linux/arm64 node:20',
              },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          {
            name: 'FROM',
            args: '--platform=linux/arm64 node:20',
            lineno: 1,
            raw: 'FROM --platform=linux/arm64 node:20',
          },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('build.platform-mismatch');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.hostArch).toBe('amd64');
      expect(results[0].meta?.specifiedPlatform).toBe('linux/arm64');
    });

    it('should return nothing when platform matches host arch', async () => {
      const check = findCheck(checks, 'build.platform-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: 'FROM --platform=linux/amd64 node:20\n',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              {
                name: 'FROM',
                args: '--platform=linux/amd64 node:20',
                lineno: 1,
                raw: 'FROM --platform=linux/amd64 node:20',
              },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          {
            name: 'FROM',
            args: '--platform=linux/amd64 node:20',
            lineno: 1,
            raw: 'FROM --platform=linux/amd64 node:20',
          },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing when no dockerfile is provided', async () => {
      const check = findCheck(checks, 'build.platform-mismatch');
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing when docker version command fails', async () => {
      const check = findCheck(checks, 'build.platform-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: 'FROM --platform=linux/arm64 node:20\n',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              {
                name: 'FROM',
                args: '--platform=linux/arm64 node:20',
                lineno: 1,
                raw: 'FROM --platform=linux/arm64 node:20',
              },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          {
            name: 'FROM',
            args: '--platform=linux/arm64 node:20',
            lineno: 1,
            raw: 'FROM --platform=linux/arm64 node:20',
          },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing when FROM has no --platform flag', async () => {
      const check = findCheck(checks, 'build.platform-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: 'FROM node:20\n',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              {
                name: 'FROM',
                args: 'node:20',
                lineno: 1,
                raw: 'FROM node:20',
              },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          {
            name: 'FROM',
            args: 'node:20',
            lineno: 1,
            raw: 'FROM node:20',
          },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should detect mismatch across multiple stages', async () => {
      const check = findCheck(checks, 'build.platform-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              {
                name: 'FROM',
                args: '--platform=linux/arm64 node:20 AS builder',
                lineno: 1,
                raw: 'FROM --platform=linux/arm64 node:20 AS builder',
              },
            ],
            startLine: 1,
          },
          {
            baseImage: 'nginx:latest',
            instructions: [
              {
                name: 'FROM',
                args: '--platform=linux/arm64 nginx:latest',
                lineno: 5,
                raw: 'FROM --platform=linux/arm64 nginx:latest',
              },
            ],
            startLine: 5,
          },
        ],
        allInstructions: [
          {
            name: 'FROM',
            args: '--platform=linux/arm64 node:20 AS builder',
            lineno: 1,
            raw: 'FROM --platform=linux/arm64 node:20 AS builder',
          },
          {
            name: 'FROM',
            args: '--platform=linux/arm64 nginx:latest',
            lineno: 5,
            raw: 'FROM --platform=linux/arm64 nginx:latest',
          },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.severity === 'warning')).toBe(true);
    });
  });
});
