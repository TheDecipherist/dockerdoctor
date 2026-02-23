import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPing = vi.fn();
const mockListContainers = vi.fn();
const mockListImages = vi.fn();
const mockListVolumes = vi.fn();
const mockListNetworks = vi.fn();
const mockDf = vi.fn();
const mockContainerInspect = vi.fn();
const mockContainerLogs = vi.fn();
const mockGetContainer = vi.fn().mockReturnValue({
  inspect: mockContainerInspect,
  logs: mockContainerLogs,
});

vi.mock('dockerode', () => {
  return {
    default: function Docker() {
      return {
        ping: mockPing,
        listContainers: mockListContainers,
        listImages: mockListImages,
        listVolumes: mockListVolumes,
        listNetworks: mockListNetworks,
        df: mockDf,
        getContainer: mockGetContainer,
      };
    },
  };
});

const {
  getClient,
  resetClient,
  ping,
  listContainers,
  listImages,
  listVolumes,
  listNetworks,
  inspectContainer,
  getContainerLogs,
  getDiskUsage,
} = await import('../../../src/docker/client.js');

beforeEach(() => {
  vi.clearAllMocks();
  resetClient();
  mockGetContainer.mockReturnValue({
    inspect: mockContainerInspect,
    logs: mockContainerLogs,
  });
});

describe('getClient', () => {
  it('returns a Docker instance', () => {
    const client = getClient();
    expect(client).toBeDefined();
    expect(client).toHaveProperty('ping');
  });

  it('returns the same instance on subsequent calls', () => {
    const a = getClient();
    const b = getClient();
    expect(a).toBe(b);
  });

  it('returns a new instance after resetClient', () => {
    const a = getClient();
    resetClient();
    const b = getClient();
    expect(a).not.toBe(b);
  });
});

describe('ping', () => {
  it('returns true when Docker responds', async () => {
    mockPing.mockResolvedValue('OK');
    expect(await ping()).toBe(true);
  });

  it('returns false when Docker is unavailable', async () => {
    mockPing.mockRejectedValue(new Error('connect ENOENT'));
    expect(await ping()).toBe(false);
  });
});

describe('listContainers', () => {
  it('returns mapped container summaries', async () => {
    mockListContainers.mockResolvedValue([
      {
        Id: 'abc123',
        Names: ['/my-app'],
        Image: 'node:20',
        State: 'running',
        Status: 'Up 2 hours',
        Ports: [{ IP: '0.0.0.0', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' }],
        Labels: { env: 'prod' },
        NetworkSettings: { Networks: { bridge: {} } },
        Created: 1700000000,
      },
    ]);

    const result = await listContainers();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('abc123');
    expect(result[0].names).toEqual(['my-app']);
    expect(result[0].image).toBe('node:20');
    expect(result[0].state).toBe('running');
    expect(result[0].ports).toHaveLength(1);
    expect(result[0].ports[0].PublicPort).toBe(3000);
    expect(result[0].labels).toEqual({ env: 'prod' });
    expect(result[0].networkNames).toEqual(['bridge']);
  });

  it('defaults to all=true', async () => {
    mockListContainers.mockResolvedValue([]);
    await listContainers();
    expect(mockListContainers).toHaveBeenCalledWith({ all: true });
  });

  it('respects all=false option', async () => {
    mockListContainers.mockResolvedValue([]);
    await listContainers({ all: false });
    expect(mockListContainers).toHaveBeenCalledWith({ all: false });
  });

  it('handles containers with missing optional fields', async () => {
    mockListContainers.mockResolvedValue([
      {
        Id: 'xyz',
        Names: null,
        Image: 'alpine',
        State: 'exited',
        Status: 'Exited (0)',
        Ports: null,
        Labels: null,
        NetworkSettings: null,
        Created: 0,
      },
    ]);

    const result = await listContainers();
    expect(result[0].names).toEqual([]);
    expect(result[0].ports).toEqual([]);
    expect(result[0].labels).toEqual({});
    expect(result[0].networkNames).toEqual([]);
  });
});

describe('listImages', () => {
  it('returns mapped image summaries', async () => {
    mockListImages.mockResolvedValue([
      {
        Id: 'sha256:abc',
        RepoTags: ['node:20-slim'],
        Size: 200_000_000,
        Created: 1700000000,
        Labels: { maintainer: 'test' },
      },
    ]);

    const result = await listImages();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sha256:abc');
    expect(result[0].repoTags).toEqual(['node:20-slim']);
    expect(result[0].size).toBe(200_000_000);
    expect(result[0].labels).toEqual({ maintainer: 'test' });
  });

  it('filters dangling images when requested', async () => {
    mockListImages.mockResolvedValue([]);
    await listImages({ dangling: true });
    expect(mockListImages).toHaveBeenCalledWith({ filters: { dangling: ['true'] } });
  });

  it('passes no filters when dangling is undefined', async () => {
    mockListImages.mockResolvedValue([]);
    await listImages();
    expect(mockListImages).toHaveBeenCalledWith({ filters: {} });
  });

  it('handles images with null RepoTags and Labels', async () => {
    mockListImages.mockResolvedValue([
      { Id: 'sha256:xyz', RepoTags: null, Size: 100, Created: 0, Labels: null },
    ]);

    const result = await listImages();
    expect(result[0].repoTags).toEqual([]);
    expect(result[0].labels).toEqual({});
  });
});

describe('listVolumes', () => {
  it('returns mapped volume summaries', async () => {
    mockListVolumes.mockResolvedValue({
      Volumes: [
        { Name: 'data-vol', Driver: 'local', Mountpoint: '/var/lib/docker/volumes/data-vol', Labels: { app: 'web' } },
      ],
    });

    const result = await listVolumes();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('data-vol');
    expect(result[0].driver).toBe('local');
    expect(result[0].labels).toEqual({ app: 'web' });
  });

  it('handles null Volumes', async () => {
    mockListVolumes.mockResolvedValue({ Volumes: null });
    const result = await listVolumes();
    expect(result).toEqual([]);
  });
});

describe('listNetworks', () => {
  it('returns mapped network summaries', async () => {
    mockListNetworks.mockResolvedValue([
      {
        Id: 'net1',
        Name: 'bridge',
        Driver: 'bridge',
        Scope: 'local',
        Containers: {
          abc: { Name: 'my-app', IPv4Address: '172.17.0.2/16' },
        },
      },
    ]);

    const result = await listNetworks();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('bridge');
    expect(result[0].driver).toBe('bridge');
    expect(result[0].containers.abc.name).toBe('my-app');
    expect(result[0].containers.abc.ipv4).toBe('172.17.0.2/16');
  });

  it('handles networks with no containers', async () => {
    mockListNetworks.mockResolvedValue([
      { Id: 'net2', Name: 'none', Driver: 'null', Scope: 'local', Containers: null },
    ]);

    const result = await listNetworks();
    expect(result[0].containers).toEqual({});
  });
});

describe('inspectContainer', () => {
  it('calls inspect on the container', async () => {
    const inspectData = { Id: 'abc', State: { Running: true } };
    mockContainerInspect.mockResolvedValue(inspectData);
    const result = await inspectContainer('abc');
    expect(result).toEqual(inspectData);
  });
});

describe('getContainerLogs', () => {
  it('returns logs as string', async () => {
    mockContainerLogs.mockResolvedValue('line 1\nline 2');
    const result = await getContainerLogs('abc');
    expect(result).toBe('line 1\nline 2');
  });

  it('converts Buffer to string', async () => {
    mockContainerLogs.mockResolvedValue(Buffer.from('buffer logs'));
    const result = await getContainerLogs('abc');
    expect(result).toBe('buffer logs');
  });

  it('defaults to tail 100', async () => {
    mockContainerLogs.mockResolvedValue('');
    await getContainerLogs('abc');
    expect(mockContainerLogs).toHaveBeenCalledWith({ stdout: true, stderr: true, tail: 100 });
  });

  it('respects custom tail option', async () => {
    mockContainerLogs.mockResolvedValue('');
    await getContainerLogs('abc', { tail: 50 });
    expect(mockContainerLogs).toHaveBeenCalledWith({ stdout: true, stderr: true, tail: 50 });
  });
});

describe('getDiskUsage', () => {
  it('sums up disk usage from df response', async () => {
    mockDf.mockResolvedValue({
      Containers: [{ SizeRw: 1000 }, { SizeRw: 2000 }],
      Images: [{ Size: 5000 }],
      Volumes: [{ UsageData: { Size: 3000 } }],
      BuildCache: [{ Size: 500 }, { Size: 500 }],
    });

    const result = await getDiskUsage();
    expect(result.containers).toBe(3000);
    expect(result.images).toBe(5000);
    expect(result.volumes).toBe(3000);
    expect(result.buildCache).toBe(1000);
    expect(result.total).toBe(12000);
  });

  it('handles null/empty df fields', async () => {
    mockDf.mockResolvedValue({
      Containers: null,
      Images: null,
      Volumes: null,
      BuildCache: null,
    });

    const result = await getDiskUsage();
    expect(result.total).toBe(0);
  });
});
