import * as fs from 'node:fs';
import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'lineendings.crlf',
  name: 'CRLF Line Endings in Shell Scripts',
  category: 'lineendings',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    for (const scriptPath of context.files.shellScripts) {
      let buf: Buffer;

      try {
        buf = fs.readFileSync(scriptPath);
      } catch {
        // File may have been deleted or be inaccessible
        continue;
      }

      // Check for CRLF: 0x0D (CR) followed by 0x0A (LF)
      let hasCrlf = false;
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i] === 0x0d && buf[i + 1] === 0x0a) {
          hasCrlf = true;
          break;
        }
      }

      if (!hasCrlf) continue;

      results.push({
        id: 'lineendings.crlf',
        title: `Shell script has CRLF line endings`,
        severity: 'error',
        category: 'lineendings',
        message:
          `\`${scriptPath}\` contains Windows-style CRLF (\\r\\n) line endings. ` +
          `When this script is copied into a Linux-based Docker container, the shell ` +
          `interpreter will fail with cryptic errors like \`/bin/sh: bad interpreter\` or ` +
          `\`$'\\r': command not found\`. Shell scripts must use Unix-style LF (\\n) endings.`,
        location: scriptPath,
        fixes: [
          {
            description: 'Convert CRLF to LF line endings',
            type: 'auto',
            async apply(): Promise<boolean> {
              try {
                const content = fs.readFileSync(scriptPath);
                // Replace all CRLF with LF
                const fixed = Buffer.from(
                  content.toString('binary').replace(/\r\n/g, '\n'),
                  'binary',
                );
                fs.writeFileSync(scriptPath, fixed);
                return true;
              } catch {
                return false;
              }
            },
          },
          {
            description: 'Convert line endings manually',
            type: 'manual',
            instructions:
              `Convert the file using one of these methods:\n\n` +
              `  # Using dos2unix:\n` +
              `  dos2unix ${scriptPath}\n\n` +
              `  # Using sed:\n` +
              `  sed -i 's/\\r$//' ${scriptPath}\n\n` +
              `  # Using tr:\n` +
              `  tr -d '\\r' < ${scriptPath} > ${scriptPath}.tmp && mv ${scriptPath}.tmp ${scriptPath}\n\n` +
              `To prevent this in the future, configure your editor to use LF endings ` +
              `for shell scripts, or add a .gitattributes file.`,
          },
        ],
        meta: {
          scriptPath,
        },
      });
    }

    return results;
  },
});
