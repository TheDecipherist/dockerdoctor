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
const { listContainers, listNetworks } = await import('../../../src/docker/client.js');
const { dockerExec } = await import('../../../src/docker/exec.js');

// NOW import the checks (triggers registration)
await import('../../../src/checks/network/index.js');

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

describe('network checks', () => {
  let checks: Check[];

  beforeEach(() => {
    vi.resetAllMocks();
    checks = getChecksByCategory('network');
  });

  it('should have all 4 network checks registered', () => {
    expect(checks.length).toBe(4);
  });

  // --- network.same-network ---
  describe('network.same-network', () => {
    it('should return warning when containers in same project do not share networks', async () => {
      const check = findCheck(checks, 'network.same-network');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'container-a',
          names: ['myproject-web-1'],
          image: 'node:20',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [],
          labels: { 'com.docker.compose.project': 'myproject' },
          networkNames: ['network-a'],
          created: Date.now(),
        },
        {
          id: 'container-b',
          names: ['myproject-db-1'],
          image: 'postgres:15',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [],
          labels: { 'com.docker.compose.project': 'myproject' },
          networkNames: ['network-b'],
          created: Date.now(),
        },
      ]);
      vi.mocked(listNetworks).mockResolvedValue([
        { id: 'net-a', name: 'network-a', driver: 'bridge', scope: 'local', containers: {} },
        { id: 'net-b', name: 'network-b', driver: 'bridge', scope: 'local', containers: {} },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('network.same-network');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.project).toBe('myproject');
    });

    it('should return nothing when containers in same project share a network', async () => {
      const check = findCheck(checks, 'network.same-network');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'container-a',
          names: ['myproject-web-1'],
          image: 'node:20',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [],
          labels: { 'com.docker.compose.project': 'myproject' },
          networkNames: ['myproject_default'],
          created: Date.now(),
        },
        {
          id: 'container-b',
          names: ['myproject-db-1'],
          image: 'postgres:15',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [],
          labels: { 'com.docker.compose.project': 'myproject' },
          networkNames: ['myproject_default'],
          created: Date.now(),
        },
      ]);
      vi.mocked(listNetworks).mockResolvedValue([
        { id: 'net-default', name: 'myproject_default', driver: 'bridge', scope: 'local', containers: {} },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing when fewer than 2 containers exist', async () => {
      const check = findCheck(checks, 'network.same-network');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'only-one',
          names: ['solo-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          ports: [],
          labels: { 'com.docker.compose.project': 'myproject' },
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      vi.mocked(listNetworks).mockResolvedValue([]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should skip containers without compose project label', async () => {
      const check = findCheck(checks, 'network.same-network');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'standalone-a',
          names: ['standalone-1'],
          image: 'node:20',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
        {
          id: 'standalone-b',
          names: ['standalone-2'],
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [],
          labels: {},
          networkNames: ['host'],
          created: Date.now(),
        },
      ]);
      vi.mocked(listNetworks).mockResolvedValue([]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should detect multiple pairs without shared networks', async () => {
      const check = findCheck(checks, 'network.same-network');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'c1',
          names: ['proj-a-1'],
          image: 'img-a',
          state: 'running',
          status: 'Up',
          ports: [],
          labels: { 'com.docker.compose.project': 'proj' },
          networkNames: ['net-1'],
          created: Date.now(),
        },
        {
          id: 'c2',
          names: ['proj-b-1'],
          image: 'img-b',
          state: 'running',
          status: 'Up',
          ports: [],
          labels: { 'com.docker.compose.project': 'proj' },
          networkNames: ['net-2'],
          created: Date.now(),
        },
        {
          id: 'c3',
          names: ['proj-c-1'],
          image: 'img-c',
          state: 'running',
          status: 'Up',
          ports: [],
          labels: { 'com.docker.compose.project': 'proj' },
          networkNames: ['net-3'],
          created: Date.now(),
        },
      ]);
      vi.mocked(listNetworks).mockResolvedValue([]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      // 3 containers, 3 pairs: (c1,c2), (c1,c3), (c2,c3)
      expect(results).toHaveLength(3);
    });
  });

  // --- network.dns-resolution ---
  describe('network.dns-resolution', () => {
    it('should return warning when nslookup fails inside container', async () => {
      const check = findCheck(checks, 'network.dns-resolution');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'dns-container-1',
          names: ['dns-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: '',
        stderr: 'nslookup: can\'t resolve',
        exitCode: 1,
      });
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('network.dns-resolution');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.exitCode).toBe(1);
    });

    it('should return nothing when nslookup succeeds', async () => {
      const check = findCheck(checks, 'network.dns-resolution');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'dns-ok-1',
          names: ['dns-ok-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: 'Server: 127.0.0.11\nAddress: 127.0.0.11\nName: localhost\nAddress: 127.0.0.1',
        stderr: '',
        exitCode: 0,
      });
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing when no running containers exist', async () => {
      const check = findCheck(checks, 'network.dns-resolution');
      vi.mocked(listContainers).mockResolvedValue([]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should call dockerExec with correct exec arguments', async () => {
      const check = findCheck(checks, 'network.dns-resolution');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'target-container-id',
          names: ['target-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      vi.mocked(dockerExec).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const ctx = makeContext();
      await check.run(ctx);
      expect(dockerExec).toHaveBeenCalledWith(
        ['exec', 'target-container-id', 'nslookup', 'localhost'],
        { timeout: 10000 },
      );
    });

    it('should include stderr in warning message', async () => {
      const check = findCheck(checks, 'network.dns-resolution');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'stderr-container',
          names: ['stderr-app'],
          image: 'alpine:latest',
          state: 'running',
          status: 'Up 2 minutes',
          ports: [],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      vi.mocked(dockerExec).mockResolvedValue({
        stdout: '',
        stderr: 'nslookup: write to DNS server failed',
        exitCode: 1,
      });
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].message).toContain('nslookup: write to DNS server failed');
    });
  });

  // --- network.port-conflicts ---
  describe('network.port-conflicts', () => {
    it('should return error when two containers bind the same host port', async () => {
      const check = findCheck(checks, 'network.port-conflicts');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'web-1',
          names: ['web-server-1'],
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [{ IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
        {
          id: 'web-2',
          names: ['web-server-2'],
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 5 minutes',
          ports: [{ IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('network.port-conflicts');
      expect(results[0].severity).toBe('error');
      expect(results[0].meta?.publicPort).toBe(8080);
      expect(results[0].meta?.containers).toContain('web-server-1');
      expect(results[0].meta?.containers).toContain('web-server-2');
    });

    it('should return nothing when no port conflicts exist', async () => {
      const check = findCheck(checks, 'network.port-conflicts');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'web-1',
          names: ['web-server-1'],
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [{ IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
        {
          id: 'api-1',
          names: ['api-server-1'],
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          ports: [{ IP: '0.0.0.0', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' }],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing when fewer than 2 containers exist', async () => {
      const check = findCheck(checks, 'network.port-conflicts');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'solo-1',
          names: ['solo-app'],
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 5 minutes',
          ports: [{ IP: '0.0.0.0', PrivatePort: 80, PublicPort: 80, Type: 'tcp' }],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should ignore ports without PublicPort', async () => {
      const check = findCheck(checks, 'network.port-conflicts');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'internal-1',
          names: ['internal-app-1'],
          image: 'node:20',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [{ PrivatePort: 3000, Type: 'tcp' }],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
        {
          id: 'internal-2',
          names: ['internal-app-2'],
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          ports: [{ PrivatePort: 3000, Type: 'tcp' }],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should detect multiple port conflicts', async () => {
      const check = findCheck(checks, 'network.port-conflicts');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'multi-1',
          names: ['multi-app-1'],
          image: 'myapp:latest',
          state: 'running',
          status: 'Up',
          ports: [
            { IP: '0.0.0.0', PrivatePort: 80, PublicPort: 80, Type: 'tcp' },
            { IP: '0.0.0.0', PrivatePort: 443, PublicPort: 443, Type: 'tcp' },
          ],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
        {
          id: 'multi-2',
          names: ['multi-app-2'],
          image: 'myapp:latest',
          state: 'running',
          status: 'Up',
          ports: [
            { IP: '0.0.0.0', PrivatePort: 80, PublicPort: 80, Type: 'tcp' },
            { IP: '0.0.0.0', PrivatePort: 443, PublicPort: 443, Type: 'tcp' },
          ],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(2);
      const ports = results.map((r) => r.meta?.publicPort);
      expect(ports).toContain(80);
      expect(ports).toContain(443);
    });
  });

  // --- network.localhost-binding ---
  describe('network.localhost-binding', () => {
    it('should return warning for 127.0.0.1 binding', async () => {
      const check = findCheck(checks, 'network.localhost-binding');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'localhost-container-1',
          names: ['local-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [{ IP: '127.0.0.1', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' }],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('network.localhost-binding');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.containerName).toBe('local-app');
      expect(results[0].meta?.localhostPorts).toContain(3000);
    });

    it('should return nothing for 0.0.0.0 binding', async () => {
      const check = findCheck(checks, 'network.localhost-binding');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'public-container-1',
          names: ['public-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [{ IP: '0.0.0.0', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' }],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing when no containers exist', async () => {
      const check = findCheck(checks, 'network.localhost-binding');
      vi.mocked(listContainers).mockResolvedValue([]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should return nothing for ports without PublicPort', async () => {
      const check = findCheck(checks, 'network.localhost-binding');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'no-public-1',
          names: ['no-public-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          ports: [{ IP: '127.0.0.1', PrivatePort: 3000, Type: 'tcp' }],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should detect multiple localhost-bound ports on a single container', async () => {
      const check = findCheck(checks, 'network.localhost-binding');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'multi-local-1',
          names: ['multi-local-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 10 minutes',
          ports: [
            { IP: '127.0.0.1', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' },
            { IP: '127.0.0.1', PrivatePort: 3001, PublicPort: 3001, Type: 'tcp' },
          ],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      // One result per container, but it should list both ports
      expect(results).toHaveLength(1);
      expect(results[0].meta?.localhostPorts).toHaveLength(2);
      expect(results[0].meta?.localhostPorts).toContain(3000);
      expect(results[0].meta?.localhostPorts).toContain(3001);
    });

    it('should only flag localhost-bound ports, not 0.0.0.0 ports on same container', async () => {
      const check = findCheck(checks, 'network.localhost-binding');
      vi.mocked(listContainers).mockResolvedValue([
        {
          id: 'mixed-1',
          names: ['mixed-app'],
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          ports: [
            { IP: '0.0.0.0', PrivatePort: 80, PublicPort: 80, Type: 'tcp' },
            { IP: '127.0.0.1', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' },
          ],
          labels: {},
          networkNames: ['bridge'],
          created: Date.now(),
        },
      ]);
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].meta?.localhostPorts).toEqual([3000]);
    });
  });
});
