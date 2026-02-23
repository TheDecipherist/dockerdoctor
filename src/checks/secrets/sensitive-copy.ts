import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

const SENSITIVE_FILE_PATTERNS = [
  { pattern: /\.env\b/, label: '.env' },
  { pattern: /\.npmrc\b/, label: '.npmrc' },
  { pattern: /\.pem\b/, label: '*.pem' },
  { pattern: /\.key\b/, label: '*.key' },
  { pattern: /\bid_rsa\b/, label: 'id_rsa' },
  { pattern: /\bid_ed25519\b/, label: 'id_ed25519' },
  { pattern: /\bid_ecdsa\b/, label: 'id_ecdsa' },
  { pattern: /\bcredentials\b/, label: 'credentials' },
  { pattern: /\.aws\//, label: '.aws/' },
  { pattern: /\.ssh\//, label: '.ssh/' },
  { pattern: /\.gnupg\//, label: '.gnupg/' },
  { pattern: /\.p12\b/, label: '*.p12' },
  { pattern: /\.pfx\b/, label: '*.pfx' },
  { pattern: /\.jks\b/, label: '*.jks' },
];

registerCheck({
  id: 'secrets.sensitive-copy',
  name: 'COPY of Sensitive File Into Image',
  category: 'secrets',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const instr of context.dockerfile.allInstructions) {
      if (instr.name !== 'COPY' && instr.name !== 'ADD') continue;

      const args = instr.args.trim();

      for (const { pattern, label } of SENSITIVE_FILE_PATTERNS) {
        if (pattern.test(args)) {
          results.push({
            id: 'secrets.sensitive-copy',
            title: `Sensitive file "${label}" copied into image`,
            severity: 'error',
            category: 'secrets',
            message:
              `${instr.name} instruction at line ${instr.lineno} copies a sensitive file ` +
              `(\`${label}\`) into the Docker image: \`${instr.raw.trim()}\`. ` +
              `Even if the file is deleted in a later layer, it remains accessible in ` +
              `the image layer history. Anyone who pulls the image can extract it. ` +
              `Use \`.dockerignore\` to exclude sensitive files, or mount them at runtime.`,
            location: context.dockerfile.path,
            line: instr.lineno,
            fixes: [
              {
                description: 'Exclude sensitive files and use runtime mounts',
                type: 'manual',
                instructions:
                  `Remove the sensitive file from the COPY instruction and add it to .dockerignore:\n\n` +
                  `  # Add to .dockerignore:\n` +
                  `  ${label}\n\n` +
                  `  # If the file is needed at build time, use BuildKit secrets:\n` +
                  `  RUN --mount=type=secret,id=myfile,target=/run/secrets/myfile \\\n` +
                  `      cat /run/secrets/myfile\n\n` +
                  `  # If the file is needed at runtime, mount it:\n` +
                  `  docker run -v ./my-secret:/app/my-secret:ro myimage\n\n` +
                  `  # Or use Docker Compose:\n` +
                  `  volumes:\n` +
                  `    - ./my-secret:/app/my-secret:ro`,
              },
            ],
            meta: {
              sensitiveFile: label,
              instruction: instr.name,
              lineNumber: instr.lineno,
              rawInstruction: instr.raw,
            },
          });

          // Only report one match per instruction to avoid duplicates
          break;
        }
      }
    }

    return results;
  },
});
