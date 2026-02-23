import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  looksLikeComposeFile,
  findComposeFile,
  findAllComposeFiles,
} from '../../src/discovery.js';

describe('discovery', () => {
  const tempDirs: string[] = [];

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dockerdoctor-disc-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tempDirs.length = 0;
  });

  describe('looksLikeComposeFile()', () => {
    it('returns true for a file with top-level services:', () => {
      const dir = createTempDir();
      const filePath = join(dir, 'stack.yml');
      writeFileSync(filePath, 'services:\n  web:\n    image: nginx\n');
      expect(looksLikeComposeFile(filePath)).toBe(true);
    });

    it('returns true when services: has trailing whitespace', () => {
      const dir = createTempDir();
      const filePath = join(dir, 'stack.yml');
      writeFileSync(filePath, 'services :  \n  web:\n    image: nginx\n');
      expect(looksLikeComposeFile(filePath)).toBe(true);
    });

    it('returns true when services: is preceded by comments', () => {
      const dir = createTempDir();
      const filePath = join(dir, 'stack.yml');
      writeFileSync(filePath, '# My compose file\n\nservices:\n  web:\n    image: nginx\n');
      expect(looksLikeComposeFile(filePath)).toBe(true);
    });

    it('returns false for Kubernetes manifest (apiVersion/kind)', () => {
      const dir = createTempDir();
      const filePath = join(dir, 'deployment.yml');
      writeFileSync(
        filePath,
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\n',
      );
      expect(looksLikeComposeFile(filePath)).toBe(false);
    });

    it('returns false for GitHub Actions with indented services:', () => {
      const dir = createTempDir();
      const filePath = join(dir, 'ci.yml');
      writeFileSync(
        filePath,
        'name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    services:\n      postgres:\n        image: postgres\n',
      );
      expect(looksLikeComposeFile(filePath)).toBe(false);
    });

    it('returns false for empty YAML file', () => {
      const dir = createTempDir();
      const filePath = join(dir, 'empty.yml');
      writeFileSync(filePath, '');
      expect(looksLikeComposeFile(filePath)).toBe(false);
    });

    it('returns false for non-existent file', () => {
      expect(looksLikeComposeFile('/tmp/does-not-exist-12345.yml')).toBe(false);
    });
  });

  describe('findComposeFile()', () => {
    it('prefers standard compose names (fast path)', () => {
      const dir = createTempDir();
      writeFileSync(
        join(dir, 'docker-compose.yml'),
        'services:\n  web:\n    image: nginx\n',
      );
      writeFileSync(
        join(dir, 'production.yml'),
        'services:\n  api:\n    image: node\n',
      );

      const result = findComposeFile(dir);
      expect(result).toBe(join(dir, 'docker-compose.yml'));
    });

    it('falls back to sniffing non-standard YAML files', () => {
      const dir = createTempDir();
      writeFileSync(
        join(dir, 'production.yml'),
        'services:\n  api:\n    image: node\n',
      );

      const result = findComposeFile(dir);
      expect(result).toBe(join(dir, 'production.yml'));
    });

    it('returns undefined for directory with no compose files', () => {
      const dir = createTempDir();
      writeFileSync(join(dir, 'readme.txt'), 'hello\n');

      expect(findComposeFile(dir)).toBeUndefined();
    });

    it('returns undefined for directory with only non-compose YAML', () => {
      const dir = createTempDir();
      writeFileSync(
        join(dir, 'config.yml'),
        'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: test\n',
      );

      expect(findComposeFile(dir)).toBeUndefined();
    });

    it('respects SNIFF_EXCLUDE (skips .gitlab-ci.yml)', () => {
      const dir = createTempDir();
      // .gitlab-ci.yml has top-level services: but should be excluded
      writeFileSync(
        join(dir, '.gitlab-ci.yml'),
        'services:\n  - docker:dind\nstages:\n  - build\n',
      );

      expect(findComposeFile(dir)).toBeUndefined();
    });

    it('returns alphabetically first match when multiple sniffed files exist', () => {
      const dir = createTempDir();
      writeFileSync(
        join(dir, 'beta.yml'),
        'services:\n  b:\n    image: nginx\n',
      );
      writeFileSync(
        join(dir, 'alpha.yml'),
        'services:\n  a:\n    image: nginx\n',
      );

      const result = findComposeFile(dir);
      expect(result).toBe(join(dir, 'alpha.yml'));
    });

    it('returns undefined for non-existent directory', () => {
      expect(findComposeFile('/tmp/does-not-exist-dir-12345')).toBeUndefined();
    });
  });

  describe('findAllComposeFiles()', () => {
    it('returns standard names first, then sniffed files', () => {
      const dir = createTempDir();
      writeFileSync(
        join(dir, 'compose.yml'),
        'services:\n  web:\n    image: nginx\n',
      );
      writeFileSync(
        join(dir, 'production.yml'),
        'services:\n  api:\n    image: node\n',
      );

      const results = findAllComposeFiles(dir);
      expect(results).toEqual([
        join(dir, 'compose.yml'),
        join(dir, 'production.yml'),
      ]);
    });

    it('returns empty array for directory with no compose files', () => {
      const dir = createTempDir();
      writeFileSync(join(dir, 'readme.txt'), 'hello\n');

      expect(findAllComposeFiles(dir)).toEqual([]);
    });

    it('finds multiple standard and sniffed files', () => {
      const dir = createTempDir();
      writeFileSync(
        join(dir, 'docker-compose.yml'),
        'services:\n  a:\n    image: nginx\n',
      );
      writeFileSync(
        join(dir, 'compose.yml'),
        'services:\n  b:\n    image: nginx\n',
      );
      writeFileSync(
        join(dir, 'staging.yml'),
        'services:\n  c:\n    image: nginx\n',
      );
      writeFileSync(
        join(dir, 'config.yml'),
        'apiVersion: v1\nkind: ConfigMap\n',
      );

      const results = findAllComposeFiles(dir);
      expect(results).toEqual([
        join(dir, 'docker-compose.yml'),
        join(dir, 'compose.yml'),
        join(dir, 'staging.yml'),
      ]);
    });

    it('excludes SNIFF_EXCLUDE files even if they have services:', () => {
      const dir = createTempDir();
      writeFileSync(
        join(dir, '.gitlab-ci.yml'),
        'services:\n  - docker:dind\n',
      );
      writeFileSync(
        join(dir, 'Chart.yaml'),
        'services:\n  - some-chart\n',
      );

      expect(findAllComposeFiles(dir)).toEqual([]);
    });
  });
});
