import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers } from '../../docker/client.js';

const EXIT_CODE_DESCRIPTIONS: Record<number, string> = {
  1: 'General application error',
  126: 'Permission denied — command found but not executable',
  127: 'Command not found — entrypoint or CMD binary does not exist',
  137: 'OOM killed or received SIGKILL (exit 128 + signal 9)',
  139: 'Segmentation fault — SIGSEGV (exit 128 + signal 11)',
  143: 'Graceful termination — received SIGTERM (exit 128 + signal 15)',
};

registerCheck({
  id: 'startup.exit-code-analysis',
  name: 'Container Exit Code Analysis',
  category: 'startup',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let containers: Awaited<ReturnType<typeof listContainers>>;
    try {
      containers = await listContainers({ all: true });
    } catch {
      return [];
    }

    const exited = containers.filter(
      (c) => c.state === 'exited',
    );

    const results: CheckResult[] = [];

    for (const container of exited) {
      // Extract exit code from status string (e.g. "Exited (1) 2 hours ago")
      const exitMatch = container.status.match(/Exited\s+\((\d+)\)/i);
      if (!exitMatch) continue;

      const exitCode = parseInt(exitMatch[1], 10);
      if (exitCode === 0) continue;

      const name = container.names[0] ?? container.id.slice(0, 12);
      const description =
        EXIT_CODE_DESCRIPTIONS[exitCode] ?? `Unknown exit code ${exitCode}`;

      results.push({
        id: 'startup.exit-code-analysis',
        title: `Container "${name}" exited with code ${exitCode}`,
        severity: 'error',
        category: 'startup',
        message:
          `Container \`${name}\` (image: \`${container.image}\`) exited with code ${exitCode}. ` +
          `${description}. Status: ${container.status}.`,
        fixes: [
          {
            description: 'Check container logs for error details',
            type: 'manual',
            instructions:
              `Run \`docker logs ${name}\` to see the full container output.\n\n` +
              (exitCode === 137
                ? 'Exit code 137 indicates the container was killed (OOM or manual kill). ' +
                  'Check memory limits with `docker inspect ' +
                  name +
                  '` and consider increasing the memory limit.\n'
                : '') +
              (exitCode === 127
                ? 'Exit code 127 means the entrypoint or CMD binary was not found. ' +
                  'Verify the binary path in your Dockerfile CMD/ENTRYPOINT instruction.\n'
                : '') +
              (exitCode === 126
                ? 'Exit code 126 means the entrypoint exists but is not executable. ' +
                  'Ensure the file has execute permissions: `chmod +x <entrypoint>`.\n'
                : ''),
          },
        ],
        meta: {
          containerId: container.id,
          containerName: name,
          image: container.image,
          exitCode,
          exitCodeDescription: description,
          status: container.status,
        },
      });
    }

    return results;
  },
});
