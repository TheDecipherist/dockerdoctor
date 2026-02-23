import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

const NATIVE_PACKAGES = [
  'bcrypt',
  'sharp',
  'canvas',
  'node-gyp',
  'node-pre-gyp',
  'node-sass',
  'sodium-native',
  'libsodium',
  'better-sqlite3',
  'sqlite3',
  'grpc',
  '@grpc/grpc-js',
  'farmhash',
  'leveldown',
  'ed25519',
  'dtrace-provider',
  'argon2',
  'cpu-features',
  'microtime',
  'fsevents',
  'deasync',
  're2',
  'esbuild',
  'lightningcss',
  'isolated-vm',
];

// Build a single regex that matches any of the native packages in an npm context
const nativePackagePattern = new RegExp(
  `\\b(?:${NATIVE_PACKAGES.map((p) => p.replace(/[.*+?^${}()|[\]\\/@]/g, '\\$&')).join('|')})\\b`
);

registerCheck({
  id: 'dockerfile.alpine-native',
  name: 'Alpine Image With Native Dependencies',
  category: 'dockerfile',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.dockerfile) return [];

    const results: CheckResult[] = [];

    for (const stage of context.dockerfile.stages) {
      const baseImage = stage.baseImage.toLowerCase();
      const isAlpine = baseImage.includes('alpine');

      if (!isAlpine) continue;

      // Check for npm/yarn/pnpm install of native packages, or COPY of package.json
      // followed by install which might pull in native deps. We also check for
      // explicit native package names in RUN instructions.
      const detectedPackages: string[] = [];
      let firstDetectionLine: number | undefined;

      for (const instr of stage.instructions) {
        if (instr.name !== 'RUN') continue;

        const cmd = instr.args;

        // Check for npm install of specific native packages
        const matches = cmd.match(nativePackagePattern);
        if (matches) {
          for (const match of cmd.matchAll(new RegExp(nativePackagePattern, 'g'))) {
            if (!detectedPackages.includes(match[0])) {
              detectedPackages.push(match[0]);
              if (firstDetectionLine === undefined) {
                firstDetectionLine = instr.lineno;
              }
            }
          }
        }

        // Also check for node-gyp rebuild or npm rebuild which strongly implies native deps
        if (/\b(?:node-gyp\s+(?:rebuild|build|configure)|npm\s+rebuild)\b/.test(cmd)) {
          if (!detectedPackages.includes('node-gyp')) {
            detectedPackages.push('node-gyp');
            if (firstDetectionLine === undefined) {
              firstDetectionLine = instr.lineno;
            }
          }
        }
      }

      if (detectedPackages.length > 0) {
        results.push({
          id: 'dockerfile.alpine-native',
          title: 'Alpine image with native dependencies',
          severity: 'warning',
          category: 'dockerfile',
          message:
            `The base image \`${stage.baseImage}\` is Alpine-based, but the stage installs ` +
            `native dependencies (${detectedPackages.join(', ')}). Alpine uses musl libc ` +
            `instead of glibc, which causes many native Node.js modules to fail to compile ` +
            `or require extra build tooling (python3, make, g++). This leads to larger images, ` +
            `longer build times, and potential runtime segfaults. Consider using a Debian-based ` +
            `slim image instead.`,
          location: context.dockerfile.path,
          line: firstDetectionLine ?? stage.startLine,
          fixes: [
            {
              description: 'Switch to a Debian-based slim image',
              type: 'manual',
              instructions:
                `Replace the Alpine base image with a slim Debian variant:\n\n` +
                `  Before: FROM ${stage.baseImage}\n` +
                `  After:  FROM node:20-slim\n\n` +
                `Debian-slim images are only slightly larger than Alpine but provide ` +
                `full glibc compatibility, which native Node.js modules expect. ` +
                `This avoids the need for extra build tools and eliminates musl-related ` +
                `runtime issues.\n\n` +
                `If you must use Alpine, install the required build dependencies:\n` +
                `  RUN apk add --no-cache python3 make g++ && \\\n` +
                `      npm ci && \\\n` +
                `      apk del python3 make g++`,
            },
          ],
          meta: {
            baseImage: stage.baseImage,
            detectedPackages,
            stageName: stage.name,
          },
        });
      }
    }

    return results;
  },
});
