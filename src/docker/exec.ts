import { execa, type ResultPromise } from 'execa';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function dockerExec(args: string[], opts?: { timeout?: number }): Promise<ExecResult> {
  try {
    const result = await execa('docker', args, {
      timeout: opts?.timeout ?? 30000,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
    };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; exitCode?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.exitCode ?? 1,
    };
  }
}

export async function dockerSystemDf(): Promise<ExecResult> {
  return dockerExec(['system', 'df', '--format', '{{json .}}']);
}

export async function dockerStats(containerIds?: string[]): Promise<ExecResult> {
  const args = ['stats', '--no-stream', '--format', '{{json .}}'];
  if (containerIds?.length) {
    args.push(...containerIds);
  }
  return dockerExec(args);
}

export async function dockerInspect(target: string): Promise<ExecResult> {
  return dockerExec(['inspect', target]);
}

export async function dockerLogs(
  containerIdOrName: string,
  opts?: { tail?: number },
): Promise<ExecResult> {
  const args = ['logs', '--tail', String(opts?.tail ?? 100), containerIdOrName];
  return dockerExec(args);
}

export async function dockerBuildContextSize(contextPath: string): Promise<number> {
  try {
    const result = await execa('du', ['-sb', contextPath], { timeout: 10000 });
    const sizeStr = result.stdout.split('\t')[0];
    return parseInt(sizeStr, 10) || 0;
  } catch {
    return -1;
  }
}

export async function dockerImageHistory(imageRef: string): Promise<ExecResult> {
  return dockerExec(['history', '--no-trunc', '--format', '{{json .}}', imageRef]);
}

export async function dockerNetworkInspect(networkName: string): Promise<ExecResult> {
  return dockerExec(['network', 'inspect', networkName]);
}

export async function dockerPortCheck(port: number): Promise<boolean> {
  const result = await dockerExec(['ps', '--format', '{{.Ports}}']);
  if (result.exitCode !== 0) return false;
  const portPattern = new RegExp(`0\\.0\\.0\\.0:${port}->|:::${port}->`);
  return portPattern.test(result.stdout);
}
