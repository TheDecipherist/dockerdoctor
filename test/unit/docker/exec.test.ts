import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExeca = vi.fn();
vi.mock('execa', () => ({
  execa: mockExeca,
}));

const {
  dockerExec,
  dockerSystemDf,
  dockerStats,
  dockerInspect,
  dockerLogs,
  dockerBuildContextSize,
  dockerImageHistory,
  dockerNetworkInspect,
  dockerPortCheck,
} = await import('../../../src/docker/exec.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dockerExec', () => {
  it('returns stdout, stderr, and exitCode on success', async () => {
    mockExeca.mockResolvedValue({ stdout: 'output', stderr: '', exitCode: 0 });
    const result = await dockerExec(['ps']);
    expect(result).toEqual({ stdout: 'output', stderr: '', exitCode: 0 });
    expect(mockExeca).toHaveBeenCalledWith('docker', ['ps'], { timeout: 30000 });
  });

  it('returns error output when command fails', async () => {
    mockExeca.mockRejectedValue({ stdout: '', stderr: 'not found', exitCode: 1 });
    const result = await dockerExec(['inspect', 'nothing']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('not found');
  });

  it('defaults exitCode to 1 when error has no exitCode', async () => {
    mockExeca.mockRejectedValue(new Error('timeout'));
    const result = await dockerExec(['info']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('uses custom timeout when provided', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await dockerExec(['info'], { timeout: 5000 });
    expect(mockExeca).toHaveBeenCalledWith('docker', ['info'], { timeout: 5000 });
  });
});

describe('dockerSystemDf', () => {
  it('calls docker system df with json format', async () => {
    mockExeca.mockResolvedValue({ stdout: '{}', stderr: '', exitCode: 0 });
    const result = await dockerSystemDf();
    expect(mockExeca).toHaveBeenCalledWith('docker', ['system', 'df', '--format', '{{json .}}'], { timeout: 30000 });
    expect(result.exitCode).toBe(0);
  });
});

describe('dockerStats', () => {
  it('calls docker stats with no-stream and json format', async () => {
    mockExeca.mockResolvedValue({ stdout: '{}', stderr: '', exitCode: 0 });
    await dockerStats();
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['stats', '--no-stream', '--format', '{{json .}}'],
      { timeout: 30000 },
    );
  });

  it('appends container IDs when provided', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await dockerStats(['abc', 'def']);
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['stats', '--no-stream', '--format', '{{json .}}', 'abc', 'def'],
      { timeout: 30000 },
    );
  });
});

describe('dockerInspect', () => {
  it('calls docker inspect on a target', async () => {
    mockExeca.mockResolvedValue({ stdout: '[{}]', stderr: '', exitCode: 0 });
    const result = await dockerInspect('my-container');
    expect(mockExeca).toHaveBeenCalledWith('docker', ['inspect', 'my-container'], { timeout: 30000 });
    expect(result.stdout).toBe('[{}]');
  });
});

describe('dockerLogs', () => {
  it('gets logs with default tail of 100', async () => {
    mockExeca.mockResolvedValue({ stdout: 'log line', stderr: '', exitCode: 0 });
    await dockerLogs('my-app');
    expect(mockExeca).toHaveBeenCalledWith('docker', ['logs', '--tail', '100', 'my-app'], { timeout: 30000 });
  });

  it('uses custom tail option', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await dockerLogs('my-app', { tail: 50 });
    expect(mockExeca).toHaveBeenCalledWith('docker', ['logs', '--tail', '50', 'my-app'], { timeout: 30000 });
  });
});

describe('dockerBuildContextSize', () => {
  it('returns size in bytes from du output', async () => {
    mockExeca.mockResolvedValue({ stdout: '12345\t/path/to/context', stderr: '', exitCode: 0 });
    const size = await dockerBuildContextSize('/path/to/context');
    expect(size).toBe(12345);
    expect(mockExeca).toHaveBeenCalledWith('du', ['-sb', '/path/to/context'], { timeout: 10000 });
  });

  it('returns -1 when du fails', async () => {
    mockExeca.mockRejectedValue(new Error('command not found'));
    const size = await dockerBuildContextSize('/bad/path');
    expect(size).toBe(-1);
  });

  it('returns 0 for unparseable output', async () => {
    mockExeca.mockResolvedValue({ stdout: 'garbage', stderr: '', exitCode: 0 });
    const size = await dockerBuildContextSize('/test');
    expect(size).toBe(0);
  });
});

describe('dockerImageHistory', () => {
  it('calls docker history with no-trunc and json format', async () => {
    mockExeca.mockResolvedValue({ stdout: '{}', stderr: '', exitCode: 0 });
    await dockerImageHistory('node:20');
    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['history', '--no-trunc', '--format', '{{json .}}', 'node:20'],
      { timeout: 30000 },
    );
  });
});

describe('dockerNetworkInspect', () => {
  it('calls docker network inspect', async () => {
    mockExeca.mockResolvedValue({ stdout: '[{}]', stderr: '', exitCode: 0 });
    await dockerNetworkInspect('bridge');
    expect(mockExeca).toHaveBeenCalledWith('docker', ['network', 'inspect', 'bridge'], { timeout: 30000 });
  });
});

describe('dockerPortCheck', () => {
  it('returns true when port is in use', async () => {
    mockExeca.mockResolvedValue({
      stdout: '0.0.0.0:3000->3000/tcp\n0.0.0.0:8080->8080/tcp',
      stderr: '',
      exitCode: 0,
    });
    expect(await dockerPortCheck(3000)).toBe(true);
  });

  it('returns false when port is not in use', async () => {
    mockExeca.mockResolvedValue({
      stdout: '0.0.0.0:8080->8080/tcp',
      stderr: '',
      exitCode: 0,
    });
    expect(await dockerPortCheck(3000)).toBe(false);
  });

  it('returns false when docker ps fails', async () => {
    mockExeca.mockRejectedValue(new Error('docker not found'));
    expect(await dockerPortCheck(3000)).toBe(false);
  });
});
