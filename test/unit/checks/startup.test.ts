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
const { listContainers, inspectContainer, getContainerLogs } = await import('../../../src/docker/client.js');

// NOW import the checks (triggers registration)
await import('../../../src/checks/startup/index.js');

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

describe('startup checks', () => {
  let checks: Check[];

  beforeEach(() => {
    vi.resetAllMocks();
    checks = getChecksByCategory('startup');
  });

  it('should have all 4 startup checks registered', () => {
    expect(checks.length).toBe(4);
  });

  // --- startup.exit-code-analysis ---
  describe('startup.exit-code-analysis', () => {
    it('should return error for exited containers with non-zero exit codes', async () => {
      const check = findCheck(checks, 'startup.exit-code-analysis');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'abc123def456',
          names: ['my-app'],
          image: 'node:20',
          state: 'exited',
          status: 'Exited (1) 2 hours ago',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('startup.exit-code-analysis');
      expect(results[0].severity).toBe('error');
      expect(results[0].meta?.exitCode).toBe(1);
      expect(results[0].meta?.containerName).toBe('my-app');
    });

    it('should return nothing for running containers', async () => {
      const check = findCheck(checks, 'startup.exit-code-analysis');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'abc123def456',
          names: ['my-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 3 hours',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing for exited containers with exit code 0', async () => {
      const check = findCheck(checks, 'startup.exit-code-analysis');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'abc123def456',
          names: ['my-app'],
          image: 'node:20',
          state: 'exited',
          status: 'Exited (0) 1 hour ago',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should detect specific exit code descriptions', async () => {
      const check = findCheck(checks, 'startup.exit-code-analysis');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'abc123def456',
          names: ['crash-app'],
          image: 'myapp:latest',
          state: 'exited',
          status: 'Exited (137) 10 minutes ago',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].meta?.exitCode).toBe(137);
      expect(results[0].message).toContain('137');
    });

    it('should handle multiple exited containers', async () => {
      const check = findCheck(checks, 'startup.exit-code-analysis');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'aaa111',
          names: ['app-a'],
          image: 'img-a',
          state: 'exited',
          status: 'Exited (1) 5 min ago',
          ports: [],
          labels: {},
          networkNames: [],
          created: Date.now(),
        },
        {
          id: 'bbb222',
          names: ['app-b'],
          image: 'img-b',
          state: 'exited',
          status: 'Exited (127) 3 min ago',
          ports: [],
          labels: {},
          networkNames: [],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(2);
    });

    it('should return nothing when listContainers throws', async () => {
      const check = findCheck(checks, 'startup.exit-code-analysis');
      vi.mocked(listContainers).mockRejectedValue(new Error('Docker unavailable'));
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });
  });

  // --- startup.oom-killed ---
  describe('startup.oom-killed', () => {
    it('should return error when OOMKilled is true', async () => {
      const check = findCheck(checks, 'startup.oom-killed');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'oom-container-1',
          names: ['oom-app'],
          image: 'node:20',
          state: 'exited',
          status: 'Exited (137) 5 minutes ago',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      vi.mocked(inspectContainer).mockResolvedValue({
        State: { OOMKilled: true },
        HostConfig: { Memory: 256 * 1024 * 1024 }, // 256 MB
      } as any);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('startup.oom-killed');
      expect(results[0].severity).toBe('error');
      expect(results[0].meta?.oomKilled).toBe(true);
      expect(results[0].meta?.memoryLimitMB).toBe(256);
    });

    it('should return nothing when OOMKilled is false', async () => {
      const check = findCheck(checks, 'startup.oom-killed');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'normal-container-1',
          names: ['normal-app'],
          image: 'node:20',
          state: 'exited',
          status: 'Exited (1) 5 minutes ago',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      vi.mocked(inspectContainer).mockResolvedValue({
        State: { OOMKilled: false },
        HostConfig: { Memory: 0 },
      } as any);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing when no exited containers exist', async () => {
      const check = findCheck(checks, 'startup.oom-killed');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'running-1',
          names: ['running-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 3 hours',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should handle no memory limit set', async () => {
      const check = findCheck(checks, 'startup.oom-killed');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'oom-no-limit',
          names: ['oom-unlimited'],
          image: 'node:20',
          state: 'exited',
          status: 'Exited (137) 2 minutes ago',
          ports: [],
          labels: {},
          networkNames: [],
          created: Date.now(),
        },
      ]);
      vi.mocked(inspectContainer).mockResolvedValue({
        State: { OOMKilled: true },
        HostConfig: { Memory: 0 },
      } as any);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].meta?.memoryLimitMB).toBe(0);
      expect(results[0].message).toContain('No explicit memory limit');
    });

    it('should return nothing when listContainers throws', async () => {
      const check = findCheck(checks, 'startup.oom-killed');
      vi.mocked(listContainers).mockRejectedValue(new Error('fail'));
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should skip containers where inspectContainer throws', async () => {
      const check = findCheck(checks, 'startup.oom-killed');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'bad-inspect',
          names: ['bad-app'],
          image: 'node:20',
          state: 'exited',
          status: 'Exited (137) 1 minute ago',
          ports: [],
          labels: {},
          networkNames: [],
          created: Date.now(),
        },
      ]);
      vi.mocked(inspectContainer).mockRejectedValue(new Error('inspect failed'));
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });
  });

  // --- startup.env-var-verification ---
  describe('startup.env-var-verification', () => {
    it('should return warning when compose service has no running container', async () => {
      const check = findCheck(checks, 'startup.env-var-verification');
      vi.mocked(listContainers).mockResolvedValue([]); // No running containers
      const ctx = makeContext({
        compose: {
          path: '/test/docker-compose.yml',
          services: [
            {
              name: 'web',
              image: 'node:20',
              environment: { NODE_ENV: 'production', DB_HOST: 'db' },
            },
          ],
          networks: {},
          volumes: {},
          raw: '',
        },
      });
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('startup.env-var-verification');
      expect(results[0].severity).toBe('warning');
      expect(results[0].message).toContain('web');
      expect(results[0].message).toContain('no matching running container was found');
    });

    it('should return nothing when no compose context is provided', async () => {
      const check = findCheck(checks, 'startup.env-var-verification');
      const ctx = makeContext(); // No compose
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing when compose service has no env config', async () => {
      const check = findCheck(checks, 'startup.env-var-verification');
      vi.mocked(listContainers).mockResolvedValue([]);
      const ctx = makeContext({
        compose: {
          path: '/test/docker-compose.yml',
          services: [
            {
              name: 'web',
              image: 'nginx:latest',
              // No environment or env_file
            },
          ],
          networks: {},
          volumes: {},
          raw: '',
        },
      });
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should detect empty environment variables in running container', async () => {
      const check = findCheck(checks, 'startup.env-var-verification');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'web-container-1',
          names: ['myproject-web-1'],
          image: 'node:20',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [],
          labels: { 'com.docker.compose.service': 'web' },
          networkNames: ['myproject_default'],
          created: Date.now(),
        },
      ]);
      vi.mocked(inspectContainer).mockResolvedValue({
        Config: {
          Env: [
            'NODE_ENV=production',
            'DB_HOST=',
            'API_KEY=',
            'PATH=/usr/local/bin',
            'HOME=/root',
          ],
        },
      } as any);
      const ctx = makeContext({
        compose: {
          path: '/test/docker-compose.yml',
          services: [
            {
              name: 'web',
              image: 'node:20',
              environment: { NODE_ENV: 'production', DB_HOST: '', API_KEY: '' },
            },
          ],
          networks: {},
          volumes: {},
          raw: '',
        },
      });
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('startup.env-var-verification');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.emptyVars).toContain('DB_HOST');
      expect(results[0].meta?.emptyVars).toContain('API_KEY');
    });

    it('should match container by compose label', async () => {
      const check = findCheck(checks, 'startup.env-var-verification');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'some-container',
          names: ['unrelated-name'],
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          ports: [],
          labels: { 'com.docker.compose.service': 'api' },
          networkNames: ['default'],
          created: Date.now(),
        },
      ]);
      vi.mocked(inspectContainer).mockResolvedValue({
        Config: {
          Env: ['NODE_ENV=production', 'PATH=/usr/bin'],
        },
      } as any);
      const ctx = makeContext({
        compose: {
          path: '/test/docker-compose.yml',
          services: [
            {
              name: 'api',
              image: 'node:20',
              environment: { NODE_ENV: 'production' },
            },
          ],
          networks: {},
          volumes: {},
          raw: '',
        },
      });
      const results = await check.run(ctx);
      // No empty vars, so no results
      expect(results).toHaveLength(0);
    });

    it('should handle env_file config', async () => {
      const check = findCheck(checks, 'startup.env-var-verification');
      vi.mocked(listContainers).mockResolvedValue([]);
      const ctx = makeContext({
        compose: {
          path: '/test/docker-compose.yml',
          services: [
            {
              name: 'worker',
              image: 'node:20',
              env_file: '.env',
            },
          ],
          networks: {},
          volumes: {},
          raw: '',
        },
      });
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].meta?.hasEnvFile).toBe(true);
    });
  });

  // --- startup.entrypoint-exists ---
  describe('startup.entrypoint-exists', () => {
    it('should return error for container with exit code 127 (command not found)', async () => {
      const check = findCheck(checks, 'startup.entrypoint-exists');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'entry-container-1',
          names: ['broken-app'],
          image: 'myapp:latest',
          state: 'exited',
          status: 'Exited (127) 5 minutes ago',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      vi.mocked(getContainerLogs).mockResolvedValue(
        '/bin/sh: /app/start.sh: not found',
      );
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('startup.entrypoint-exists');
      expect(results[0].severity).toBe('error');
      expect(results[0].meta?.exitCode).toBe(127);
      expect(results[0].message).toContain('not found');
    });

    it('should return error for container with exit code 126 (not executable)', async () => {
      const check = findCheck(checks, 'startup.entrypoint-exists');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'perm-container-1',
          names: ['perm-app'],
          image: 'myapp:latest',
          state: 'exited',
          status: 'Exited (126) 5 minutes ago',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      vi.mocked(getContainerLogs).mockResolvedValue(
        '/bin/sh: /app/start.sh: Permission denied',
      );
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('startup.entrypoint-exists');
      expect(results[0].severity).toBe('error');
      expect(results[0].meta?.exitCode).toBe(126);
      expect(results[0].message).toContain('not executable');
    });

    it('should include log snippet in result message', async () => {
      const check = findCheck(checks, 'startup.entrypoint-exists');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'log-container-1',
          names: ['log-app'],
          image: 'myapp:latest',
          state: 'exited',
          status: 'Exited (127) 2 minutes ago',
          ports: [],
          labels: {},
          networkNames: [],
          created: Date.now(),
        },
      ]);
      const logContent = 'exec /app/entrypoint.sh: no such file or directory';
      vi.mocked(getContainerLogs).mockResolvedValue(logContent);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].message).toContain(logContent);
      expect(results[0].meta?.logTail).toBe(logContent);
    });

    it('should return nothing for containers with other exit codes', async () => {
      const check = findCheck(checks, 'startup.entrypoint-exists');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'other-container-1',
          names: ['other-app'],
          image: 'myapp:latest',
          state: 'exited',
          status: 'Exited (1) 5 minutes ago',
          ports: [],
          labels: {},
          networkNames: [],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing for running containers', async () => {
      const check = findCheck(checks, 'startup.entrypoint-exists');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'running-1',
          names: ['running-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 1 hour',
          ports: [],
          labels: {},
          networkNames: [],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should handle getContainerLogs failure gracefully', async () => {
      const check = findCheck(checks, 'startup.entrypoint-exists');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'no-log-container',
          names: ['no-log-app'],
          image: 'myapp:latest',
          state: 'exited',
          status: 'Exited (127) 1 minute ago',
          ports: [],
          labels: {},
          networkNames: [],
          created: Date.now(),
        },
      ]);
      vi.mocked(getContainerLogs).mockRejectedValue(new Error('logs unavailable'));
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].meta?.logTail).toBe('(unable to retrieve logs)');
    });

    it('should return nothing when listContainers throws', async () => {
      const check = findCheck(checks, 'startup.entrypoint-exists');
      vi.mocked(listContainers).mockRejectedValue(new Error('Docker down'));
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });
  });
});
