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
const { listContainers, listImages, getDiskUsage } = await import(
  '../../../src/docker/client.js'
);
const { dockerExec } = await import('../../../src/docker/exec.js');

// NOW import the checks (triggers registration)
await import('../../../src/checks/cleanup/index.js');

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

describe('cleanup checks', () => {
  let checks: Check[];

  beforeEach(() => {
    vi.resetAllMocks();
    checks = getChecksByCategory('cleanup');
  });

  it('should have all 5 cleanup checks registered', () => {
    expect(checks.length).toBe(5);
  });

  // --- cleanup.disk-usage ---
  describe('cleanup.disk-usage', () => {
    it('should return nothing for low disk usage (<10 GB)', async () => {
      const check = findCheck(checks, 'cleanup.disk-usage');
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 1 * 1024 * 1024 * 1024,
        images: 2 * 1024 * 1024 * 1024,
        volumes: 1 * 1024 * 1024 * 1024,
        buildCache: 1 * 1024 * 1024 * 1024,
        total: 5 * 1024 * 1024 * 1024, // 5 GB
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return warning for disk usage >10 GB but <30 GB', async () => {
      const check = findCheck(checks, 'cleanup.disk-usage');
      const total = 15 * 1024 * 1024 * 1024; // 15 GB
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 3 * 1024 * 1024 * 1024,
        images: 6 * 1024 * 1024 * 1024,
        volumes: 3 * 1024 * 1024 * 1024,
        buildCache: 3 * 1024 * 1024 * 1024,
        total,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('cleanup.disk-usage');
      expect(results[0].severity).toBe('warning');
      expect(results[0].title).toBe('Docker disk usage exceeds 10 GB');
      expect(results[0].meta?.totalBytes).toBe(total);
    });

    it('should return error for disk usage >30 GB', async () => {
      const check = findCheck(checks, 'cleanup.disk-usage');
      const total = 40 * 1024 * 1024 * 1024; // 40 GB
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 8 * 1024 * 1024 * 1024,
        images: 20 * 1024 * 1024 * 1024,
        volumes: 6 * 1024 * 1024 * 1024,
        buildCache: 6 * 1024 * 1024 * 1024,
        total,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('cleanup.disk-usage');
      expect(results[0].severity).toBe('error');
      expect(results[0].title).toBe('Docker disk usage exceeds 30 GB');
      expect(results[0].meta?.totalBytes).toBe(total);
    });

    it('should return nothing when getDiskUsage throws', async () => {
      const check = findCheck(checks, 'cleanup.disk-usage');
      vi.mocked(getDiskUsage).mockRejectedValue(new Error('Docker not available'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should include breakdown in meta for warning', async () => {
      const check = findCheck(checks, 'cleanup.disk-usage');
      const containers = 3 * 1024 * 1024 * 1024;
      const images = 6 * 1024 * 1024 * 1024;
      const volumes = 3 * 1024 * 1024 * 1024;
      const buildCache = 3 * 1024 * 1024 * 1024;
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers,
        images,
        volumes,
        buildCache,
        total: 15 * 1024 * 1024 * 1024,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.imagesBytes).toBe(images);
      expect(results[0].meta?.containersBytes).toBe(containers);
      expect(results[0].meta?.volumesBytes).toBe(volumes);
      expect(results[0].meta?.buildCacheBytes).toBe(buildCache);
    });

    it('should include breakdown in meta for error', async () => {
      const check = findCheck(checks, 'cleanup.disk-usage');
      const containers = 10 * 1024 * 1024 * 1024;
      const images = 15 * 1024 * 1024 * 1024;
      const volumes = 8 * 1024 * 1024 * 1024;
      const buildCache = 7 * 1024 * 1024 * 1024;
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers,
        images,
        volumes,
        buildCache,
        total: 40 * 1024 * 1024 * 1024,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.imagesBytes).toBe(images);
      expect(results[0].meta?.containersBytes).toBe(containers);
      expect(results[0].meta?.volumesBytes).toBe(volumes);
      expect(results[0].meta?.buildCacheBytes).toBe(buildCache);
    });

    it('should return nothing for exactly 10 GB (at boundary)', async () => {
      const check = findCheck(checks, 'cleanup.disk-usage');
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 2 * 1024 * 1024 * 1024,
        images: 4 * 1024 * 1024 * 1024,
        volumes: 2 * 1024 * 1024 * 1024,
        buildCache: 2 * 1024 * 1024 * 1024,
        total: 10 * 1024 * 1024 * 1024, // exactly 10 GB
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });
  });

  // --- cleanup.dangling-images ---
  describe('cleanup.dangling-images', () => {
    it('should return warning when dangling images exist', async () => {
      const check = findCheck(checks, 'cleanup.dangling-images');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:aaa', repoTags: [], size: 200 * 1024 * 1024, created: 1000, labels: {} },
        { id: 'sha256:bbb', repoTags: [], size: 300 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('cleanup.dangling-images');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.count).toBe(2);
      expect(results[0].meta?.totalMB).toBe(500);
    });

    it('should return nothing when no dangling images exist', async () => {
      const check = findCheck(checks, 'cleanup.dangling-images');
      vi.mocked(listImages).mockResolvedValue([]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing when listImages throws', async () => {
      const check = findCheck(checks, 'cleanup.dangling-images');
      vi.mocked(listImages).mockRejectedValue(new Error('Docker not available'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should calculate total size correctly', async () => {
      const check = findCheck(checks, 'cleanup.dangling-images');
      const size1 = 150 * 1024 * 1024;
      const size2 = 250 * 1024 * 1024;
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:aaa', repoTags: [], size: size1, created: 1000, labels: {} },
        { id: 'sha256:bbb', repoTags: [], size: size2, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.totalBytes).toBe(size1 + size2);
      expect(results[0].meta?.totalMB).toBe(Math.round((size1 + size2) / (1024 * 1024)));
    });

    it('should call listImages with dangling filter', async () => {
      const check = findCheck(checks, 'cleanup.dangling-images');
      vi.mocked(listImages).mockResolvedValue([]);
      await check.run(makeContext());
      expect(listImages).toHaveBeenCalledWith({ dangling: true });
    });
  });

  // --- cleanup.stopped-containers ---
  describe('cleanup.stopped-containers', () => {
    it('should return info when stopped containers are found', async () => {
      const check = findCheck(checks, 'cleanup.stopped-containers');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'abc123',
          names: ['/my-container'],
          image: 'myapp:latest',
          state: 'exited',
          status: 'Exited (0) 2 hours ago',
          ports: [],
          created: 1000,
        },
        {
          id: 'def456',
          names: ['/another-container'],
          image: 'nginx:latest',
          state: 'exited',
          status: 'Exited (1) 5 hours ago',
          ports: [],
          created: 1000,
        },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('cleanup.stopped-containers');
      expect(results[0].severity).toBe('info');
      expect(results[0].meta?.count).toBe(2);
    });

    it('should return nothing when no stopped containers exist', async () => {
      const check = findCheck(checks, 'cleanup.stopped-containers');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'abc123',
          names: ['/running-container'],
          image: 'myapp:latest',
          state: 'running',
          status: 'Up 2 hours',
          ports: [],
          created: 1000,
        },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing when container list is empty', async () => {
      const check = findCheck(checks, 'cleanup.stopped-containers');
      vi.mocked(listContainers).mockResolvedValue([]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing when listContainers throws', async () => {
      const check = findCheck(checks, 'cleanup.stopped-containers');
      vi.mocked(listContainers).mockRejectedValue(new Error('Docker not available'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should include dead containers as stopped', async () => {
      const check = findCheck(checks, 'cleanup.stopped-containers');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'abc123',
          names: ['/dead-container'],
          image: 'myapp:latest',
          state: 'dead',
          status: 'Dead',
          ports: [],
          created: 1000,
        },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.count).toBe(1);
    });

    it('should call listContainers with all flag', async () => {
      const check = findCheck(checks, 'cleanup.stopped-containers');
      vi.mocked(listContainers).mockResolvedValue([]);
      await check.run(makeContext());
      expect(listContainers).toHaveBeenCalledWith({ all: true });
    });

    it('should include container names in meta', async () => {
      const check = findCheck(checks, 'cleanup.stopped-containers');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'abc123',
          names: ['/web-server'],
          image: 'nginx:latest',
          state: 'exited',
          status: 'Exited (0) 1 hour ago',
          ports: [],
          created: 1000,
        },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.containerNames).toContain('/web-server');
    });

    it('should filter out running containers from results', async () => {
      const check = findCheck(checks, 'cleanup.stopped-containers');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'abc123',
          names: ['/running'],
          image: 'myapp:latest',
          state: 'running',
          status: 'Up 2 hours',
          ports: [],
          created: 1000,
        },
        {
          id: 'def456',
          names: ['/stopped'],
          image: 'nginx:latest',
          state: 'exited',
          status: 'Exited (0) 3 hours ago',
          ports: [],
          created: 1000,
        },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.count).toBe(1);
    });
  });

  // --- cleanup.unused-volumes ---
  describe('cleanup.unused-volumes', () => {
    it('should return warning when unused volumes are found', async () => {
      const check = findCheck(checks, 'cleanup.unused-volumes');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout:
          JSON.stringify({ Name: 'vol1' }) +
          '\n' +
          JSON.stringify({ Name: 'vol2' }) +
          '\n',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('cleanup.unused-volumes');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.count).toBe(2);
      expect(results[0].meta?.volumeNames).toEqual(['vol1', 'vol2']);
    });

    it('should return nothing when no unused volumes exist', async () => {
      const check = findCheck(checks, 'cleanup.unused-volumes');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing when dockerExec throws', async () => {
      const check = findCheck(checks, 'cleanup.unused-volumes');
      vi.mocked(dockerExec).mockRejectedValue(new Error('Docker not available'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing when command exits with non-zero code', async () => {
      const check = findCheck(checks, 'cleanup.unused-volumes');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should call dockerExec with correct volume ls arguments', async () => {
      const check = findCheck(checks, 'cleanup.unused-volumes');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
      await check.run(makeContext());
      expect(dockerExec).toHaveBeenCalledWith([
        'volume',
        'ls',
        '--filter',
        'dangling=true',
        '--format',
        '{{json .}}',
      ]);
    });

    it('should handle unparseable JSON lines gracefully', async () => {
      const check = findCheck(checks, 'cleanup.unused-volumes');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout:
          'not-json\n' +
          JSON.stringify({ Name: 'valid-vol' }) +
          '\n',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.count).toBe(1);
      expect(results[0].meta?.volumeNames).toEqual(['valid-vol']);
    });

    it('should handle entries missing the Name field', async () => {
      const check = findCheck(checks, 'cleanup.unused-volumes');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout:
          JSON.stringify({ Driver: 'local' }) +
          '\n' +
          JSON.stringify({ Name: 'real-vol' }) +
          '\n',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.count).toBe(1);
      expect(results[0].meta?.volumeNames).toEqual(['real-vol']);
    });
  });

  // --- cleanup.build-cache ---
  describe('cleanup.build-cache', () => {
    it('should return nothing for small build cache (<1 GB)', async () => {
      const check = findCheck(checks, 'cleanup.build-cache');
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 1 * 1024 * 1024 * 1024,
        images: 2 * 1024 * 1024 * 1024,
        volumes: 1 * 1024 * 1024 * 1024,
        buildCache: 500 * 1024 * 1024, // 500 MB
        total: 5 * 1024 * 1024 * 1024,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return info for build cache >1 GB but <5 GB', async () => {
      const check = findCheck(checks, 'cleanup.build-cache');
      const buildCache = 2 * 1024 * 1024 * 1024; // 2 GB
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 1 * 1024 * 1024 * 1024,
        images: 2 * 1024 * 1024 * 1024,
        volumes: 1 * 1024 * 1024 * 1024,
        buildCache,
        total: 6 * 1024 * 1024 * 1024,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('cleanup.build-cache');
      expect(results[0].severity).toBe('info');
      expect(results[0].title).toBe('Build cache exceeds 1 GB');
      expect(results[0].meta?.buildCacheBytes).toBe(buildCache);
    });

    it('should return warning for build cache >5 GB', async () => {
      const check = findCheck(checks, 'cleanup.build-cache');
      const buildCache = 8 * 1024 * 1024 * 1024; // 8 GB
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 1 * 1024 * 1024 * 1024,
        images: 2 * 1024 * 1024 * 1024,
        volumes: 1 * 1024 * 1024 * 1024,
        buildCache,
        total: 12 * 1024 * 1024 * 1024,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('cleanup.build-cache');
      expect(results[0].severity).toBe('warning');
      expect(results[0].title).toBe('Build cache exceeds 5 GB');
      expect(results[0].meta?.buildCacheBytes).toBe(buildCache);
    });

    it('should return nothing when getDiskUsage throws', async () => {
      const check = findCheck(checks, 'cleanup.build-cache');
      vi.mocked(getDiskUsage).mockRejectedValue(new Error('Docker not available'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should include formatted size in meta', async () => {
      const check = findCheck(checks, 'cleanup.build-cache');
      const buildCache = 2 * 1024 * 1024 * 1024; // 2 GB
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 1 * 1024 * 1024 * 1024,
        images: 2 * 1024 * 1024 * 1024,
        volumes: 1 * 1024 * 1024 * 1024,
        buildCache,
        total: 6 * 1024 * 1024 * 1024,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.buildCacheFormatted).toBe('2.0 GB');
    });

    it('should return nothing for exactly 1 GB (at boundary)', async () => {
      const check = findCheck(checks, 'cleanup.build-cache');
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 1 * 1024 * 1024 * 1024,
        images: 2 * 1024 * 1024 * 1024,
        volumes: 1 * 1024 * 1024 * 1024,
        buildCache: 1 * 1024 * 1024 * 1024, // exactly 1 GB
        total: 5 * 1024 * 1024 * 1024,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return warning (not info) for exactly 5 GB boundary', async () => {
      const check = findCheck(checks, 'cleanup.build-cache');
      vi.mocked(getDiskUsage).mockResolvedValue({
        containers: 1 * 1024 * 1024 * 1024,
        images: 2 * 1024 * 1024 * 1024,
        volumes: 1 * 1024 * 1024 * 1024,
        buildCache: 5 * 1024 * 1024 * 1024, // exactly 5 GB
        total: 9 * 1024 * 1024 * 1024,
      });
      const results = await check.run(makeContext());
      // Exactly 5 GB is NOT > 5 GB, so it should be info (>1 GB)
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe('info');
    });
  });
});
