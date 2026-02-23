import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { listContainers, getContainerLogs } from '../../docker/client.js';

registerCheck({
  id: 'startup.entrypoint-exists',
  name: 'Entrypoint / CMD Exists Check',
  category: 'startup',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let containers: Awaited<ReturnType<typeof listContainers>>;
    try {
      containers = await listContainers({ all: true });
    } catch {
      return [];
    }

    const results: CheckResult[] = [];

    for (const container of containers) {
      if (container.state !== 'exited') continue;

      // Extract exit code from status string
      const exitMatch = container.status.match(/Exited\s+\((\d+)\)/i);
      if (!exitMatch) continue;

      const exitCode = parseInt(exitMatch[1], 10);

      // Only look at 126 (permission denied) and 127 (command not found)
      if (exitCode !== 126 && exitCode !== 127) continue;

      const name = container.names[0] ?? container.id.slice(0, 12);

      let logTail = '';
      try {
        logTail = await getContainerLogs(container.id, { tail: 20 });
        // Clean up Docker log stream header bytes (non-printable characters)
        logTail = logTail.replace(/[\x00-\x08]/g, '').trim();
      } catch {
        logTail = '(unable to retrieve logs)';
      }

      if (exitCode === 127) {
        results.push({
          id: 'startup.entrypoint-exists',
          title: `Container "${name}" — entrypoint/CMD not found (exit 127)`,
          severity: 'error',
          category: 'startup',
          message:
            `Container \`${name}\` (image: \`${container.image}\`) exited with code 127, ` +
            'meaning the entrypoint or CMD binary could not be found. ' +
            'The specified command does not exist in the container filesystem.' +
            (logTail ? `\n\nLast log output:\n\`\`\`\n${logTail}\n\`\`\`` : ''),
          fixes: [
            {
              description: 'Verify the entrypoint/CMD path exists in the image',
              type: 'manual',
              instructions:
                'Common causes:\n' +
                '  1. The binary specified in CMD or ENTRYPOINT is misspelled or does not exist\n' +
                '  2. The binary is not installed in the image (check your Dockerfile RUN steps)\n' +
                '  3. The binary is in a different path — use absolute paths in CMD/ENTRYPOINT\n' +
                '  4. Shell scripts referenced as entrypoint were not COPY-ed into the image\n\n' +
                'To debug:\n' +
                `  - Inspect the image: \`docker run --rm -it --entrypoint sh ${container.image}\`\n` +
                '  - Then check if the binary exists: `which <binary>` or `ls -la <path>`',
            },
          ],
          meta: {
            containerId: container.id,
            containerName: name,
            image: container.image,
            exitCode,
            logTail,
          },
        });
      } else if (exitCode === 126) {
        results.push({
          id: 'startup.entrypoint-exists',
          title: `Container "${name}" — entrypoint not executable (exit 126)`,
          severity: 'error',
          category: 'startup',
          message:
            `Container \`${name}\` (image: \`${container.image}\`) exited with code 126, ` +
            'meaning the entrypoint or CMD binary was found but is not executable. ' +
            'The file exists but lacks execute permissions.' +
            (logTail ? `\n\nLast log output:\n\`\`\`\n${logTail}\n\`\`\`` : ''),
          fixes: [
            {
              description: 'Make the entrypoint script executable',
              type: 'manual',
              instructions:
                'In your Dockerfile, ensure the entrypoint script has execute permissions:\n' +
                '  `RUN chmod +x /path/to/entrypoint.sh`\n\n' +
                'Or set permissions before COPY:\n' +
                '  `COPY --chmod=755 entrypoint.sh /app/entrypoint.sh`\n\n' +
                'Also check:\n' +
                '  - The file has the correct shebang line (e.g. `#!/bin/sh` or `#!/bin/bash`)\n' +
                '  - The file uses Unix line endings (LF), not Windows (CRLF)\n' +
                '  - The file is a valid script or binary, not a directory',
            },
          ],
          meta: {
            containerId: container.id,
            containerName: name,
            image: container.image,
            exitCode,
            logTail,
          },
        });
      }
    }

    return results;
  },
});
