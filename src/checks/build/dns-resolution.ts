import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { dockerExec } from '../../docker/exec.js';

registerCheck({
  id: 'build.dns-resolution',
  name: 'DNS Resolution Inside Containers',
  category: 'build',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    const result = await dockerExec(
      ['run', '--rm', 'alpine', 'nslookup', 'registry-1.docker.io'],
      { timeout: 30000 },
    );

    if (result.exitCode !== 0) {
      return [
        {
          id: 'build.dns-resolution',
          title: 'DNS resolution is failing inside containers',
          severity: 'error',
          category: 'build',
          message:
            'DNS lookup for `registry-1.docker.io` failed inside a container. ' +
            'This means builds that pull base images or install packages will fail. ' +
            `Exit code: ${result.exitCode}. ` +
            (result.stderr ? `Error output: ${result.stderr.trim()}` : ''),
          fixes: [
            {
              description: 'Check Docker DNS settings and host networking',
              type: 'manual',
              instructions:
                'Common causes and fixes:\n' +
                '  1. Check /etc/resolv.conf on the host — ensure it has valid nameservers\n' +
                '  2. If on a corporate VPN, the VPN may override DNS settings; try adding\n' +
                '     `"dns": ["8.8.8.8", "8.8.4.4"]` to Docker daemon config (/etc/docker/daemon.json)\n' +
                '  3. Restart the Docker daemon: `sudo systemctl restart docker`\n' +
                '  4. On macOS/Windows, reset Docker Desktop DNS settings\n' +
                '  5. If behind a proxy, configure Docker to use the proxy for DNS resolution',
            },
          ],
          meta: {
            exitCode: result.exitCode,
            stderr: result.stderr,
            stdout: result.stdout,
          },
        },
      ];
    }

    return [];
  },
});
