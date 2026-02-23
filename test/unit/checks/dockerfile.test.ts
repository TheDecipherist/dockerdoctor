import { describe, it, expect, beforeAll } from 'vitest';
import { parseDockerfile } from '../../../src/parsers/dockerfile.js';
import { getChecksByCategory } from '../../../src/checks/registry.js';
import type { CheckContext, Check } from '../../../src/types/index.js';

// Side-effect import to register all dockerfile checks
import '../../../src/checks/dockerfile/index.js';

function makeContext(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    cwd: '/test',
    dockerAvailable: false,
    files: {
      shellScripts: [],
    },
    ...overrides,
  };
}

function findCheck(id: string): Check {
  const checks = getChecksByCategory('dockerfile');
  const check = checks.find((c) => c.id === id);
  if (!check) throw new Error(`Check "${id}" not found. Available: ${checks.map((c) => c.id).join(', ')}`);
  return check;
}

describe('dockerfile checks', () => {
  let checks: Check[];

  beforeAll(() => {
    checks = getChecksByCategory('dockerfile');
  });

  it('should have all 9 dockerfile checks registered', () => {
    expect(checks.length).toBe(9);
  });

  // --- dockerfile.layer-order ---
  describe('dockerfile.layer-order', () => {
    const check = findCheck('dockerfile.layer-order');

    it('should flag when args are JSON-stringified arrays (parser behavior)', async () => {
      const raw = `FROM node:20
WORKDIR /app
COPY . .
RUN npm ci
COPY package.json ./
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.layer-order');
      expect(results[0].severity).toBe('warning');
    });

    it('should flag when a manually-constructed dockerfile has string args for COPY', async () => {
      // Test with a manually constructed ParsedDockerfile where COPY args are
      // plain strings (as the check's regex expects)
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
              { name: 'COPY', args: '. .', lineno: 2, raw: 'COPY . .' },
              { name: 'COPY', args: 'package.json ./', lineno: 3, raw: 'COPY package.json ./' },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'COPY', args: '. .', lineno: 2, raw: 'COPY . .' },
          { name: 'COPY', args: 'package.json ./', lineno: 3, raw: 'COPY package.json ./' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.layer-order');
      expect(results[0].severity).toBe('warning');
    });

    it('should not flag when package files are copied before broad copy (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
              { name: 'COPY', args: 'package.json ./', lineno: 2, raw: 'COPY package.json ./' },
              { name: 'RUN', args: 'npm ci', lineno: 3, raw: 'RUN npm ci' },
              { name: 'COPY', args: '. .', lineno: 4, raw: 'COPY . .' },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'COPY', args: 'package.json ./', lineno: 2, raw: 'COPY package.json ./' },
          { name: 'RUN', args: 'npm ci', lineno: 3, raw: 'RUN npm ci' },
          { name: 'COPY', args: '. .', lineno: 4, raw: 'COPY . .' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should return empty if no dockerfile', async () => {
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should detect various package file patterns after broad copy (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [
          {
            baseImage: 'python:3.12',
            instructions: [
              { name: 'FROM', args: 'python:3.12', lineno: 1, raw: 'FROM python:3.12' },
              { name: 'COPY', args: '. .', lineno: 2, raw: 'COPY . .' },
              { name: 'COPY', args: 'requirements.txt ./', lineno: 3, raw: 'COPY requirements.txt ./' },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          { name: 'FROM', args: 'python:3.12', lineno: 1, raw: 'FROM python:3.12' },
          { name: 'COPY', args: '. .', lineno: 2, raw: 'COPY . .' },
          { name: 'COPY', args: 'requirements.txt ./', lineno: 3, raw: 'COPY requirements.txt ./' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });
  });

  // --- dockerfile.missing-multistage ---
  describe('dockerfile.missing-multistage', () => {
    const check = findCheck('dockerfile.missing-multistage');

    it('should flag single-stage with build tools', async () => {
      const raw = `FROM node:20
RUN apt-get update && apt-get install -y build-essential gcc
COPY . .
RUN npm ci && npm run build
CMD ["node", "dist/index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.missing-multistage');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.detectedTools).toBeDefined();
    });

    it('should not flag multi-stage builds', async () => {
      const raw = `FROM node:20 AS builder
RUN apt-get update && apt-get install -y build-essential
COPY . .
RUN npm ci && npm run build

FROM node:20-slim
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag single-stage without build tools', async () => {
      const raw = `FROM node:20-slim
WORKDIR /app
COPY . .
CMD ["node", "index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });
  });

  // --- dockerfile.npm-install ---
  describe('dockerfile.npm-install', () => {
    const check = findCheck('dockerfile.npm-install');

    it('should flag npm install (bare)', async () => {
      const raw = `FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.npm-install');
      expect(results[0].severity).toBe('warning');
    });

    it('should not flag npm ci', async () => {
      const raw = `FROM node:20
COPY package*.json ./
RUN npm ci
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag npm install <specific-package>', async () => {
      const raw = `FROM node:20
RUN npm install express
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });
  });

  // --- dockerfile.node-env-trap ---
  describe('dockerfile.node-env-trap', () => {
    const check = findCheck('dockerfile.node-env-trap');

    it('should detect NODE_ENV trap from parsed ENV=syntax (JSON-stringified)', async () => {
      const raw = `FROM node:20
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.node-env-trap');
      expect(results[0].severity).toBe('error');
    });

    it('should flag NODE_ENV=production before npm install with string args', async () => {
      // Test with manually constructed args where ENV args is a plain string
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
              { name: 'ENV', args: 'NODE_ENV=production', lineno: 2, raw: 'ENV NODE_ENV=production' },
              { name: 'RUN', args: 'npm ci', lineno: 3, raw: 'RUN npm ci' },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ENV', args: 'NODE_ENV=production', lineno: 2, raw: 'ENV NODE_ENV=production' },
          { name: 'RUN', args: 'npm ci', lineno: 3, raw: 'RUN npm ci' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.node-env-trap');
      expect(results[0].severity).toBe('error');
    });

    it('should not flag NODE_ENV=production after npm install (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
              { name: 'RUN', args: 'npm ci', lineno: 2, raw: 'RUN npm ci' },
              { name: 'ENV', args: 'NODE_ENV=production', lineno: 3, raw: 'ENV NODE_ENV=production' },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'RUN', args: 'npm ci', lineno: 2, raw: 'RUN npm ci' },
          { name: 'ENV', args: 'NODE_ENV=production', lineno: 3, raw: 'ENV NODE_ENV=production' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag when NODE_ENV is not production', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
              { name: 'ENV', args: 'NODE_ENV=development', lineno: 2, raw: 'ENV NODE_ENV=development' },
              { name: 'RUN', args: 'npm ci', lineno: 3, raw: 'RUN npm ci' },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ENV', args: 'NODE_ENV=development', lineno: 2, raw: 'ENV NODE_ENV=development' },
          { name: 'RUN', args: 'npm ci', lineno: 3, raw: 'RUN npm ci' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should flag with space-separated ENV format (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [
          {
            baseImage: 'node:20',
            instructions: [
              { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
              { name: 'ENV', args: 'NODE_ENV production', lineno: 2, raw: 'ENV NODE_ENV production' },
              { name: 'RUN', args: 'npm install', lineno: 3, raw: 'RUN npm install' },
            ],
            startLine: 1,
          },
        ],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ENV', args: 'NODE_ENV production', lineno: 2, raw: 'ENV NODE_ENV production' },
          { name: 'RUN', args: 'npm install', lineno: 3, raw: 'RUN npm install' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });
  });

  // --- dockerfile.base-image-latest ---
  describe('dockerfile.base-image-latest', () => {
    const check = findCheck('dockerfile.base-image-latest');

    it('should flag :latest tag', async () => {
      const raw = `FROM node:latest
WORKDIR /app
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.base-image-latest');
      expect(results[0].severity).toBe('warning');
    });

    it('should flag no tag (implicit latest)', async () => {
      const raw = `FROM node
WORKDIR /app
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should not flag pinned version', async () => {
      const raw = `FROM node:20-slim
WORKDIR /app
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should skip scratch image', async () => {
      const raw = `FROM scratch
COPY myapp /myapp
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should skip ARG-based images', async () => {
      const raw = `ARG BASE_IMAGE=node:20
FROM $BASE_IMAGE
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should flag multiple stages with latest', async () => {
      const raw = `FROM node:latest AS builder
RUN echo "build"

FROM nginx:latest
COPY --from=builder /app/dist /usr/share/nginx/html
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(2);
    });
  });

  // --- dockerfile.alpine-native ---
  describe('dockerfile.alpine-native', () => {
    const check = findCheck('dockerfile.alpine-native');

    it('should flag alpine image with native packages', async () => {
      const raw = `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci
RUN npm install sharp
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.alpine-native');
      expect(results[0].severity).toBe('warning');
      expect((results[0].meta?.detectedPackages as string[]) ?? []).toContain('sharp');
    });

    it('should not flag alpine without native packages', async () => {
      const raw = `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag non-alpine images with native packages', async () => {
      const raw = `FROM node:20-slim
WORKDIR /app
RUN npm install bcrypt sharp
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should detect node-gyp rebuild as native dependency', async () => {
      const raw = `FROM node:20-alpine
WORKDIR /app
RUN npm ci && node-gyp rebuild
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });
  });

  // --- dockerfile.running-as-root ---
  describe('dockerfile.running-as-root', () => {
    const check = findCheck('dockerfile.running-as-root');

    it('should flag when no USER instruction in final stage', async () => {
      const raw = `FROM node:20-slim
WORKDIR /app
COPY . .
CMD ["node", "index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.running-as-root');
      expect(results[0].severity).toBe('warning');
    });

    it('should not flag when USER is set to non-root', async () => {
      const raw = `FROM node:20-slim
WORKDIR /app
COPY . .
USER node
CMD ["node", "index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should flag when USER is set to root', async () => {
      const raw = `FROM node:20-slim
WORKDIR /app
USER root
CMD ["node", "index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should only check the final stage', async () => {
      const raw = `FROM node:20 AS builder
WORKDIR /app
COPY . .
RUN npm ci

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
USER node
CMD ["node", "dist/index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      // Final stage has USER node, so no issue
      expect(results).toHaveLength(0);
    });
  });

  // --- dockerfile.missing-chown ---
  describe('dockerfile.missing-chown', () => {
    const check = findCheck('dockerfile.missing-chown');

    it('should flag COPY without --chown after USER', async () => {
      const raw = `FROM node:20-slim
WORKDIR /app
USER node
COPY . .
CMD ["node", "index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.missing-chown');
      expect(results[0].severity).toBe('warning');
    });

    it('should not flag COPY with --chown after USER', async () => {
      const raw = `FROM node:20-slim
WORKDIR /app
USER node
COPY --chown=node:node . .
CMD ["node", "index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag COPY before USER', async () => {
      const raw = `FROM node:20-slim
WORKDIR /app
COPY . .
USER node
CMD ["node", "index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should reset after USER root', async () => {
      const raw = `FROM node:20-slim
USER node
COPY a.txt .
USER root
COPY b.txt .
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      // Only COPY a.txt . should be flagged (after USER node, before USER root)
      expect(results).toHaveLength(1);
    });

    it('should also flag ADD instructions', async () => {
      const raw = `FROM node:20-slim
USER node
ADD archive.tar.gz /app/
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });
  });

  // --- dockerfile.shell-form ---
  describe('dockerfile.shell-form', () => {
    const check = findCheck('dockerfile.shell-form');

    it('should flag CMD in shell form', async () => {
      const raw = `FROM node:20-slim
CMD node index.js
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('dockerfile.shell-form');
      expect(results[0].severity).toBe('warning');
      expect(results[0].meta?.instruction).toBe('CMD');
    });

    it('should flag ENTRYPOINT in shell form', async () => {
      const raw = `FROM node:20-slim
ENTRYPOINT node index.js
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].meta?.instruction).toBe('ENTRYPOINT');
    });

    it('should not flag CMD in exec form', async () => {
      const raw = `FROM node:20-slim
CMD ["node", "index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag ENTRYPOINT in exec form', async () => {
      const raw = `FROM node:20-slim
ENTRYPOINT ["node", "index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag RUN instructions (only CMD/ENTRYPOINT)', async () => {
      const raw = `FROM node:20-slim
RUN echo "hello world"
CMD ["node", "index.js"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });
  });
});
