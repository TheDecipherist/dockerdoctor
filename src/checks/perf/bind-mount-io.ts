import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers, inspectContainer } from '../../docker/client.js';
import { dockerExec } from '../../docker/exec.js';

const HEAVY_IO_DIRS = ['node_modules', '.npm', 'vendor', 'target'];

registerCheck({
  id: 'performance.bind-mount-io',
  name: 'Bind Mount I/O Check',
  category: 'performance',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    const containers = await listContainers({ all: false });
    if (containers.length === 0) return [];

    // Detect host OS — bind mount performance issues are worst on macOS/Windows
    let hostOs = 'linux';
    try {
      const versionResult = await dockerExec(['version', '--format', '{{.Server.Os}}']);
      if (versionResult.exitCode === 0 && versionResult.stdout.trim()) {
        hostOs = versionResult.stdout.trim().toLowerCase();
      }
    } catch {
      // Default to linux if detection fails
    }

    const results: CheckResult[] = [];

    for (const c of containers) {
      const name = c.names[0] ?? c.id.slice(0, 12);
      let info;
      try {
        info = await inspectContainer(c.id);
      } catch {
        continue;
      }

      const mounts = info.Mounts ?? [];
      const heavyBindMounts: Array<{ source: string; destination: string; dirName: string }> = [];

      for (const mount of mounts) {
        if (mount.Type !== 'bind') continue;
        const source = mount.Source ?? '';
        const destination = mount.Destination ?? '';

        for (const dir of HEAVY_IO_DIRS) {
          if (
            source.includes(`/${dir}`) ||
            source.endsWith(`/${dir}`) ||
            destination.includes(`/${dir}`) ||
            destination.endsWith(`/${dir}`)
          ) {
            heavyBindMounts.push({ source, destination, dirName: dir });
            break;
          }
        }
      }

      if (heavyBindMounts.length === 0) continue;

      // On macOS/Windows, bind mounts have known performance issues
      const isSlowPlatform = hostOs === 'darwin' || hostOs === 'windows';

      const mountDetails = heavyBindMounts
        .map((m) => `  - \`${m.source}\` → \`${m.destination}\` (contains \`${m.dirName}\`)`)
        .join('\n');

      results.push({
        id: 'performance.bind-mount-io',
        title: `Heavy I/O bind mount in container \`${name}\``,
        severity: isSlowPlatform ? 'warning' : 'info',
        category: 'performance',
        message:
          `Container \`${name}\` (${c.id.slice(0, 12)}) has bind mounts for directories known to have ` +
          `heavy I/O activity:\n${mountDetails}\n\n` +
          (isSlowPlatform
            ? `On ${hostOs}, bind mount I/O is significantly slower than native filesystem access. ` +
              `This can cause 10-100x slowdowns for operations like \`npm install\` or compilation.`
            : `While Linux bind mount performance is generally acceptable, using named volumes ` +
              `for these directories can still improve performance.`),
        fixes: [
          {
            description: 'Use named volumes for heavy I/O directories',
            type: 'manual',
            instructions:
              'Replace bind mounts with named volumes for high I/O directories in your `docker-compose.yml`:\n\n' +
              '```yaml\n' +
              'services:\n' +
              `  ${name}:\n` +
              '    volumes:\n' +
              heavyBindMounts
                .map((m) => `      - ${m.dirName}_data:${m.destination}`)
                .join('\n') +
              '\n\n' +
              'volumes:\n' +
              heavyBindMounts
                .map((m) => `  ${m.dirName}_data:`)
                .join('\n') +
              '\n```\n\n' +
              'Named volumes are managed by Docker and use the native filesystem, ' +
              'avoiding the overhead of file-sharing between host and container.',
          },
        ],
        meta: {
          containerId: c.id,
          containerName: name,
          hostOs,
          isSlowPlatform,
          heavyBindMounts: heavyBindMounts.map((m) => ({ source: m.source, destination: m.destination })),
        },
      });
    }

    return results;
  },
});
