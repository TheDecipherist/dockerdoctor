import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';
import { dockerExec } from '../../docker/exec.js';

registerCheck({
  id: 'cleanup.unused-volumes',
  name: 'Unused Volumes',
  category: 'cleanup',
  requiresDocker: true,

  async run(_context: CheckContext): Promise<CheckResult[]> {
    let result;
    try {
      result = await dockerExec([
        'volume', 'ls', '--filter', 'dangling=true', '--format', '{{json .}}',
      ]);
    } catch {
      return [];
    }

    if (result.exitCode !== 0) return [];

    const lines = result.stdout.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return [];

    const volumeNames: string[] = [];
    for (const line of lines) {
      try {
        const vol = JSON.parse(line) as { Name?: string };
        if (vol.Name) volumeNames.push(vol.Name);
      } catch {
        // skip unparseable lines
      }
    }

    if (volumeNames.length === 0) return [];

    const displayed = volumeNames.slice(0, 10).join(', ');
    const suffix = volumeNames.length > 10 ? ` and ${volumeNames.length - 10} more` : '';

    return [
      {
        id: 'cleanup.unused-volumes',
        title: 'Unused volumes found',
        severity: 'warning',
        category: 'cleanup',
        message:
          `Found ${volumeNames.length} unused (dangling) volume(s): ${displayed}${suffix}. ` +
          `Unused volumes are not referenced by any container and may contain ` +
          `stale data consuming disk space.`,
        fixes: [
          {
            description: 'Remove unused volumes with docker volume prune',
            type: 'manual',
            instructions:
              'Run `docker volume prune` to remove all unused volumes.\n' +
              'Add `-f` to skip the confirmation prompt:\n' +
              '  `docker volume prune -f`\n\n' +
              'To remove a specific volume:\n' +
              '  `docker volume rm <volume_name>`\n\n' +
              'WARNING: This permanently deletes volume data. Ensure no important ' +
              'data is stored in these volumes before removing them.',
          },
        ],
        meta: {
          count: volumeNames.length,
          volumeNames,
        },
      },
    ];
  },
});
