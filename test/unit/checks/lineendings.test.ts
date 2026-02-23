import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseDockerfile } from '../../../src/parsers/dockerfile.js';
import { getChecksByCategory } from '../../../src/checks/registry.js';
import type { CheckContext, Check } from '../../../src/types/index.js';

// Side-effect import to register all lineendings checks
import '../../../src/checks/lineendings/index.js';

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
  const checks = getChecksByCategory('lineendings');
  const check = checks.find((c) => c.id === id);
  if (!check) throw new Error(`Check "${id}" not found. Available: ${checks.map((c) => c.id).join(', ')}`);
  return check;
}

describe('lineendings checks', () => {
  let checks: Check[];

  beforeAll(() => {
    checks = getChecksByCategory('lineendings');
  });

  it('should have all 3 lineendings checks registered', () => {
    expect(checks.length).toBe(3);
  });

  // --- lineendings.crlf ---
  describe('lineendings.crlf', () => {
    const check = findCheck('lineendings.crlf');
    let tempDir: string;
    const cleanupFiles: string[] = [];

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dockerdoctor-test-'));
    });

    afterEach(() => {
      for (const f of cleanupFiles) {
        try {
          fs.unlinkSync(f);
        } catch {
          // ignore
        }
      }
      cleanupFiles.length = 0;
    });

    it('should flag shell script with CRLF line endings', async () => {
      const scriptPath = path.join(tempDir, 'entrypoint.sh');
      fs.writeFileSync(scriptPath, '#!/bin/bash\r\necho "hello"\r\n');
      cleanupFiles.push(scriptPath);

      const ctx = makeContext({
        files: {
          shellScripts: [scriptPath],
        },
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('lineendings.crlf');
      expect(results[0].severity).toBe('error');
    });

    it('should not flag shell script with LF line endings', async () => {
      const scriptPath = path.join(tempDir, 'entrypoint-lf.sh');
      fs.writeFileSync(scriptPath, '#!/bin/bash\necho "hello"\n');
      cleanupFiles.push(scriptPath);

      const ctx = makeContext({
        files: {
          shellScripts: [scriptPath],
        },
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should handle missing files gracefully', async () => {
      const ctx = makeContext({
        files: {
          shellScripts: ['/nonexistent/script.sh'],
        },
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should return empty when no shell scripts', async () => {
      const ctx = makeContext({
        files: {
          shellScripts: [],
        },
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should have an auto-fix function', async () => {
      const scriptPath = path.join(tempDir, 'fixable.sh');
      fs.writeFileSync(scriptPath, '#!/bin/bash\r\necho "fix me"\r\n');
      cleanupFiles.push(scriptPath);

      const ctx = makeContext({
        files: {
          shellScripts: [scriptPath],
        },
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      const autoFix = results[0].fixes.find((f) => f.type === 'auto');
      expect(autoFix).toBeDefined();
      expect(autoFix!.apply).toBeDefined();
      expect(typeof autoFix!.apply).toBe('function');
    });
  });

  // --- lineendings.missing-gitattributes ---
  describe('lineendings.missing-gitattributes', () => {
    const check = findCheck('lineendings.missing-gitattributes');

    it('should flag when no .gitattributes path is set', async () => {
      const ctx = makeContext({
        cwd: '/test/project',
        files: {
          shellScripts: [],
          gitattributesPath: undefined,
        },
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('lineendings.missing-gitattributes');
      expect(results[0].severity).toBe('warning');
    });

    it('should not flag when .gitattributes exists', async () => {
      const ctx = makeContext({
        files: {
          shellScripts: [],
          gitattributesPath: '/test/.gitattributes',
        },
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should have an auto-fix function', async () => {
      const ctx = makeContext({
        cwd: '/test/project',
        files: {
          shellScripts: [],
          gitattributesPath: undefined,
        },
      });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      const autoFix = results[0].fixes.find((f) => f.type === 'auto');
      expect(autoFix).toBeDefined();
      expect(autoFix!.apply).toBeDefined();
      expect(typeof autoFix!.apply).toBe('function');
    });
  });

  // --- lineendings.missing-dos2unix ---
  describe('lineendings.missing-dos2unix', () => {
    const check = findCheck('lineendings.missing-dos2unix');

    it('should flag stage that copies .sh files without dos2unix', async () => {
      const raw = `FROM node:20
WORKDIR /app
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('lineendings.missing-dos2unix');
      expect(results[0].severity).toBe('warning');
    });

    it('should not flag stage with dos2unix after copy', async () => {
      const raw = `FROM node:20
WORKDIR /app
COPY entrypoint.sh /app/entrypoint.sh
RUN dos2unix /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag stage without .sh file copies', async () => {
      const raw = `FROM node:20
WORKDIR /app
COPY package.json ./
RUN npm ci
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should return empty if no dockerfile', async () => {
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should detect .sh in ADD instructions too', async () => {
      const raw = `FROM node:20
ADD scripts/start.sh /app/
CMD ["/app/start.sh"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should handle multi-stage independently', async () => {
      const raw = `FROM node:20 AS builder
COPY build.sh /app/build.sh
RUN dos2unix /app/build.sh && /app/build.sh

FROM node:20-slim
COPY deploy.sh /app/deploy.sh
CMD ["/app/deploy.sh"]
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      // builder stage has dos2unix, so no issue; final stage does NOT
      expect(results).toHaveLength(1);
    });
  });
});
