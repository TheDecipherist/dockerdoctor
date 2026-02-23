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
  dockerLogs: vi.fn(),
  dockerNetworkInspect: vi.fn(),
  dockerPortCheck: vi.fn(),
  dockerSystemDf: vi.fn(),
}));

// Import mocked modules to set return values
const { listImages } = await import('../../../src/docker/client.js');
const { dockerExec, dockerInspect, dockerImageHistory } = await import('../../../src/docker/exec.js');

// NOW import the checks (triggers registration)
await import('../../../src/checks/image/index.js');

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

describe('image checks', () => {
  let checks: Check[];

  beforeEach(() => {
    vi.resetAllMocks();
    checks = getChecksByCategory('image');
  });

  it('should have all 4 image checks registered', () => {
    expect(checks.length).toBe(4);
  });

  // --- image.image-size ---
  describe('image.image-size', () => {
    it('should return nothing for small images (<1 GB)', async () => {
      const check = findCheck(checks, 'image.image-size');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 500 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return warning for images >1 GB but <=2 GB', async () => {
      const check = findCheck(checks, 'image.image-size');
      const sizeBytes = 1.5 * 1024 * 1024 * 1024; // 1.5 GB
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['bigapp:latest'], size: sizeBytes, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('image.image-size');
      expect(results[0].severity).toBe('warning');
      expect(results[0].title).toBe('Image exceeds 1 GB');
      expect(results[0].meta?.imageName).toBe('bigapp:latest');
      expect(results[0].meta?.sizeBytes).toBe(sizeBytes);
    });

    it('should return error for images >2 GB', async () => {
      const check = findCheck(checks, 'image.image-size');
      const sizeBytes = 3 * 1024 * 1024 * 1024; // 3 GB
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['hugeapp:latest'], size: sizeBytes, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('image.image-size');
      expect(results[0].severity).toBe('error');
      expect(results[0].title).toBe('Image exceeds 2 GB');
      expect(results[0].meta?.imageName).toBe('hugeapp:latest');
    });

    it('should handle empty image list', async () => {
      const check = findCheck(checks, 'image.image-size');
      vi.mocked(listImages).mockResolvedValue([]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing when listImages throws', async () => {
      const check = findCheck(checks, 'image.image-size');
      vi.mocked(listImages).mockRejectedValue(new Error('Docker not available'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should use image ID when repoTags is empty', async () => {
      const check = findCheck(checks, 'image.image-size');
      const sizeBytes = 1.5 * 1024 * 1024 * 1024;
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abcdef123456', repoTags: [], size: sizeBytes, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.imageName).toBe('sha256:abcde');
    });

    it('should return multiple results for multiple large images', async () => {
      const check = findCheck(checks, 'image.image-size');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:aaa', repoTags: ['app1:latest'], size: 1.5 * 1024 * 1024 * 1024, created: 1000, labels: {} },
        { id: 'sha256:bbb', repoTags: ['app2:latest'], size: 3 * 1024 * 1024 * 1024, created: 1000, labels: {} },
        { id: 'sha256:ccc', repoTags: ['app3:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(2);
      expect(results[0].severity).toBe('warning'); // 1.5 GB image is first in the loop
      expect(results[1].severity).toBe('error'); // 3 GB image is second in the loop
    });
  });

  // --- image.layer-analysis ---
  describe('image.layer-analysis', () => {
    it('should return nothing for small layers', async () => {
      const check = findCheck(checks, 'image.layer-analysis');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerImageHistory).mockResolvedValue({
        stdout: JSON.stringify({ Size: 50 * 1024 * 1024, CreatedBy: 'RUN apt-get install' }) + '\n',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return warning for layers >200 MB', async () => {
      const check = findCheck(checks, 'image.layer-analysis');
      const layerSize = 300 * 1024 * 1024; // 300 MB
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 500 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerImageHistory).mockResolvedValue({
        stdout: JSON.stringify({ Size: layerSize, CreatedBy: 'RUN apt-get install -y build-essential' }) + '\n',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('image.layer-analysis');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.imageRef).toBe('myapp:latest');
      expect(results[0].meta?.sizeBytes).toBe(layerSize);
      expect(results[0].meta?.createdBy).toBe('RUN apt-get install -y build-essential');
    });

    it('should handle empty history output', async () => {
      const check = findCheck(checks, 'image.layer-analysis');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerImageHistory).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should limit to 5 images', async () => {
      const check = findCheck(checks, 'image.layer-analysis');
      const images = Array.from({ length: 8 }, (_, i) => ({
        id: `sha256:img${i}`,
        repoTags: [`app${i}:latest`],
        size: 200 * 1024 * 1024,
        created: 1000,
        labels: {},
      }));
      vi.mocked(listImages).mockResolvedValue(images);
      vi.mocked(dockerImageHistory).mockResolvedValue({
        stdout: JSON.stringify({ Size: 10 * 1024 * 1024, CreatedBy: 'small layer' }) + '\n',
        stderr: '',
        exitCode: 0,
      });
      await check.run(makeContext());
      // Should only call dockerImageHistory 5 times (limited to first 5 images)
      expect(dockerImageHistory).toHaveBeenCalledTimes(5);
    });

    it('should handle non-zero exit code from history gracefully', async () => {
      const check = findCheck(checks, 'image.layer-analysis');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerImageHistory).mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should handle history throwing an error', async () => {
      const check = findCheck(checks, 'image.layer-analysis');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerImageHistory).mockRejectedValue(new Error('timeout'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should handle string-based size values', async () => {
      const check = findCheck(checks, 'image.layer-analysis');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 500 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerImageHistory).mockResolvedValue({
        stdout: JSON.stringify({ Size: '300MB', CreatedBy: 'RUN install stuff' }) + '\n',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe('warning');
    });

    it('should skip unparseable JSON lines', async () => {
      const check = findCheck(checks, 'image.layer-analysis');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 500 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerImageHistory).mockResolvedValue({
        stdout: 'not-json\n' + JSON.stringify({ Size: 10 * 1024 * 1024, CreatedBy: 'small' }) + '\n',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0); // small layer, no warning
    });

    it('should use image ID when repoTags is empty', async () => {
      const check = findCheck(checks, 'image.layer-analysis');
      const layerSize = 300 * 1024 * 1024;
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abcdef123456', repoTags: [], size: 500 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerImageHistory).mockResolvedValue({
        stdout: JSON.stringify({ Size: layerSize, CreatedBy: 'RUN big install' }) + '\n',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.imageRef).toBe('sha256:abcdef123456');
    });

    it('should return nothing when listImages throws', async () => {
      const check = findCheck(checks, 'image.layer-analysis');
      vi.mocked(listImages).mockRejectedValue(new Error('Docker unavailable'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });
  });

  // --- image.architecture-mismatch ---
  describe('image.architecture-mismatch', () => {
    it('should return warning when architecture differs', async () => {
      const check = findCheck(checks, 'image.architecture-mismatch');
      // First call: docker version --format for host arch
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerInspect).mockResolvedValue({
        stdout: JSON.stringify([{ Architecture: 'arm64' }]),
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('image.architecture-mismatch');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.hostArch).toBe('amd64');
      expect(results[0].meta?.imageArch).toBe('arm64');
      expect(results[0].meta?.imageName).toBe('myapp:latest');
    });

    it('should return nothing when architectures match', async () => {
      const check = findCheck(checks, 'image.architecture-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerInspect).mockResolvedValue({
        stdout: JSON.stringify([{ Architecture: 'amd64' }]),
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should handle inspect failure gracefully', async () => {
      const check = findCheck(checks, 'image.architecture-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerInspect).mockRejectedValue(new Error('inspect failed'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing when docker version command fails', async () => {
      const check = findCheck(checks, 'image.architecture-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing when listImages throws', async () => {
      const check = findCheck(checks, 'image.architecture-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      vi.mocked(listImages).mockRejectedValue(new Error('Docker unavailable'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should handle inspect returning non-zero exit code', async () => {
      const check = findCheck(checks, 'image.architecture-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerInspect).mockResolvedValue({
        stdout: '',
        stderr: 'not found',
        exitCode: 1,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should handle inspect returning invalid JSON', async () => {
      const check = findCheck(checks, 'image.architecture-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerInspect).mockResolvedValue({
        stdout: 'not-json',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should handle inspect returning empty array', async () => {
      const check = findCheck(checks, 'image.architecture-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 200 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      vi.mocked(dockerInspect).mockResolvedValue({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should limit to 5 images', async () => {
      const check = findCheck(checks, 'image.architecture-mismatch');
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'amd64',
        stderr: '',
        exitCode: 0,
      });
      const images = Array.from({ length: 8 }, (_, i) => ({
        id: `sha256:img${i}`,
        repoTags: [`app${i}:latest`],
        size: 200 * 1024 * 1024,
        created: 1000,
        labels: {},
      }));
      vi.mocked(listImages).mockResolvedValue(images);
      vi.mocked(dockerInspect).mockResolvedValue({
        stdout: JSON.stringify([{ Architecture: 'amd64' }]),
        stderr: '',
        exitCode: 0,
      });
      await check.run(makeContext());
      expect(dockerInspect).toHaveBeenCalledTimes(5);
    });
  });

  // --- image.base-image-bloat ---
  describe('image.base-image-bloat', () => {
    it('should return info for large known base images without slim/alpine', async () => {
      const check = findCheck(checks, 'image.base-image-bloat');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['node:20'], size: 900 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('image.base-image-bloat');
      expect(results[0].severity).toBe('info');
      expect(results[0].meta?.tag).toBe('node:20');
    });

    it('should return nothing for small images (<500 MB)', async () => {
      const check = findCheck(checks, 'image.base-image-bloat');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['node:20'], size: 400 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing for images already using slim tags', async () => {
      const check = findCheck(checks, 'image.base-image-bloat');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['node:20-slim'], size: 900 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing for images already using alpine tags', async () => {
      const check = findCheck(checks, 'image.base-image-bloat');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['node:20-alpine'], size: 900 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should detect bloat for various known base images', async () => {
      const check = findCheck(checks, 'image.base-image-bloat');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:aaa', repoTags: ['python:3.12'], size: 900 * 1024 * 1024, created: 1000, labels: {} },
        { id: 'sha256:bbb', repoTags: ['ubuntu:22.04'], size: 700 * 1024 * 1024, created: 1000, labels: {} },
        { id: 'sha256:ccc', repoTags: ['golang:latest'], size: 800 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.severity === 'info')).toBe(true);
    });

    it('should return nothing for images with no repoTags', async () => {
      const check = findCheck(checks, 'image.base-image-bloat');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: [], size: 900 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should skip <none>:<none> tags', async () => {
      const check = findCheck(checks, 'image.base-image-bloat');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['<none>:<none>'], size: 900 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should return nothing when listImages throws', async () => {
      const check = findCheck(checks, 'image.base-image-bloat');
      vi.mocked(listImages).mockRejectedValue(new Error('Docker unavailable'));
      const results = await check.run(makeContext());
      expect(results).toHaveLength(0);
    });

    it('should detect bloat for images with :latest tag', async () => {
      const check = findCheck(checks, 'image.base-image-bloat');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['myapp:latest'], size: 900 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].meta?.tag).toBe('myapp:latest');
    });

    it('should handle images with registry prefix', async () => {
      const check = findCheck(checks, 'image.base-image-bloat');
      vi.mocked(listImages).mockResolvedValue([
        { id: 'sha256:abc123', repoTags: ['docker.io/library/node:20'], size: 900 * 1024 * 1024, created: 1000, labels: {} },
      ]);
      const results = await check.run(makeContext());
      expect(results).toHaveLength(1);
    });
  });
});
