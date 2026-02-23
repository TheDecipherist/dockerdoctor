import * as fs from 'node:fs';
import * as path from 'node:path';
import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'lineendings.missing-gitattributes',
  name: 'Missing .gitattributes File',
  category: 'lineendings',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (context.files.gitattributesPath) return [];

    const gitattributesPath = path.join(context.cwd, '.gitattributes');

    return [
      {
        id: 'lineendings.missing-gitattributes',
        title: 'No .gitattributes file found',
        severity: 'warning',
        category: 'lineendings',
        message:
          `No \`.gitattributes\` file was found in the project root. Without it, Git may ` +
          `check out files with CRLF line endings on Windows, which will break shell ` +
          `scripts when copied into Linux containers. A \`.gitattributes\` file ensures ` +
          `consistent line endings across all platforms and contributors.`,
        location: context.cwd,
        fixes: [
          {
            description: 'Create .gitattributes with LF enforcement for scripts',
            type: 'auto',
            async apply(): Promise<boolean> {
              try {
                const content =
                  '# Auto-detect text files and normalize line endings to LF\n' +
                  '* text=auto eol=lf\n' +
                  '\n' +
                  '# Ensure shell scripts always use LF\n' +
                  '*.sh text eol=lf\n';

                fs.writeFileSync(gitattributesPath, content, 'utf-8');
                return true;
              } catch {
                return false;
              }
            },
          },
          {
            description: 'Create .gitattributes manually',
            type: 'manual',
            instructions:
              `Create a \`.gitattributes\` file in the project root with:\n\n` +
              `  # Auto-detect text files and normalize line endings to LF\n` +
              `  * text=auto eol=lf\n\n` +
              `  # Ensure shell scripts always use LF\n` +
              `  *.sh text eol=lf\n\n` +
              `After creating the file, you may need to refresh the Git index:\n` +
              `  git rm --cached -r .\n` +
              `  git reset HEAD\n` +
              `  git add .\n` +
              `  git commit -m "Normalize line endings"`,
          },
        ],
        meta: {
          expectedPath: gitattributesPath,
        },
      },
    ];
  },
});
