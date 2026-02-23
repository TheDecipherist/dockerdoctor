import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers } from '../../docker/client.js';
import { dockerExec } from '../../docker/exec.js';

registerCheck({
  id: 'network.dns-resolution',
  name: 'DNS Resolution Check',
  category: 'network',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    const containers = await listContainers({ all: false });
    if (containers.length === 0) return [];

    // Only test the first running container to avoid excessive exec calls
    const target = containers[0];
    const containerName = target.names[0] ?? target.id.slice(0, 12);

    const result = await dockerExec(['exec', target.id, 'nslookup', 'localhost'], { timeout: 10000 });

    if (result.exitCode !== 0) {
      return [
        {
          id: 'network.dns-resolution',
          title: 'DNS resolution failing inside container',
          severity: 'warning',
          category: 'network',
          message:
            `DNS resolution failed inside container \`${containerName}\` (${target.id.slice(0, 12)}). ` +
            `Running \`nslookup localhost\` returned exit code ${result.exitCode}. ` +
            `This may indicate misconfigured DNS settings or missing DNS utilities in the container image. ` +
            (result.stderr ? `stderr: ${result.stderr.slice(0, 300)}` : ''),
          fixes: [
            {
              description: 'Check Docker DNS settings and network configuration',
              type: 'manual',
              instructions:
                'Possible remedies:\n' +
                '1. Verify the container has network access: `docker exec <container> ping -c 1 8.8.8.8`\n' +
                '2. Check Docker daemon DNS settings in `/etc/docker/daemon.json`:\n' +
                '   ```json\n' +
                '   { "dns": ["8.8.8.8", "8.8.4.4"] }\n' +
                '   ```\n' +
                '3. If using a custom network, ensure it has proper DNS configuration.\n' +
                '4. The container image may not include `nslookup` — this can be a false positive ' +
                'for minimal images (alpine, distroless, scratch).',
            },
          ],
          meta: { containerId: target.id, containerName, exitCode: result.exitCode },
        },
      ];
    }

    return [];
  },
});
