import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildContext } from '../../src/context.js';

describe('buildContext()', () => {
  const tempDirs: string[] = [];

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dockerdoctor-test-'));
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

  it('should parse a Dockerfile when present in the directory', async () => {
    const dir = createTempDir();
    writeFileSync(
      join(dir, 'Dockerfile'),
      'FROM node:20\nWORKDIR /app\nCMD ["node"]\n',
    );

    const ctx = await buildContext(dir);

    expect(ctx.dockerfile).toBeDefined();
    expect(ctx.dockerfile!.path).toBe(join(dir, 'Dockerfile'));
    expect(ctx.dockerfile!.stages.length).toBeGreaterThanOrEqual(1);
    expect(ctx.dockerfile!.stages[0].baseImage).toBe('node:20');
    expect(ctx.dockerfile!.allInstructions.length).toBe(3);
    expect(ctx.files.dockerfilePath).toBe(join(dir, 'Dockerfile'));
  });

  it('should parse a compose file when present in the directory', async () => {
    const dir = createTempDir();
    const composeContent = `services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
`;
    writeFileSync(join(dir, 'docker-compose.yml'), composeContent);

    const ctx = await buildContext(dir);

    expect(ctx.compose).toBeDefined();
    expect(ctx.compose!.path).toBe(join(dir, 'docker-compose.yml'));
    expect(ctx.compose!.services.length).toBe(1);
    expect(ctx.compose!.services[0].name).toBe('web');
    expect(ctx.compose!.services[0].image).toBe('nginx:latest');
    expect(ctx.files.composePath).toBe(join(dir, 'docker-compose.yml'));
  });

  it('should parse a .dockerignore when present in the directory', async () => {
    const dir = createTempDir();
    writeFileSync(
      join(dir, '.dockerignore'),
      'node_modules\n.git\n*.log\n!important.log\n',
    );

    const ctx = await buildContext(dir);

    expect(ctx.dockerignore).toBeDefined();
    expect(ctx.dockerignore!.path).toBe(join(dir, '.dockerignore'));
    expect(ctx.dockerignore!.entries.length).toBe(4);
    // First entry should be node_modules (not negated)
    expect(ctx.dockerignore!.entries[0].pattern).toBe('node_modules');
    expect(ctx.dockerignore!.entries[0].negation).toBe(false);
    // Last entry should be important.log (negated)
    expect(ctx.dockerignore!.entries[3].pattern).toBe('important.log');
    expect(ctx.dockerignore!.entries[3].negation).toBe(true);
    expect(ctx.files.dockerignorePath).toBe(join(dir, '.dockerignore'));
  });

  it('should handle an empty temp directory gracefully', async () => {
    const dir = createTempDir();

    const ctx = await buildContext(dir);

    expect(ctx.cwd).toBe(dir);
    expect(ctx.dockerfile).toBeUndefined();
    expect(ctx.compose).toBeUndefined();
    expect(ctx.dockerignore).toBeUndefined();
    expect(ctx.files.dockerfilePath).toBeUndefined();
    expect(ctx.files.composePath).toBeUndefined();
    expect(ctx.files.dockerignorePath).toBeUndefined();
    expect(ctx.files.gitattributesPath).toBeUndefined();
    expect(ctx.files.shellScripts).toEqual([]);
  });

  it('should use explicit opts.dockerfilePath override', async () => {
    const dir = createTempDir();
    // Write the Dockerfile to a non-standard name
    const customPath = join(dir, 'MyDockerfile');
    writeFileSync(customPath, 'FROM alpine:3.19\nRUN echo hello\n');

    const ctx = await buildContext(dir, { dockerfilePath: customPath });

    expect(ctx.dockerfile).toBeDefined();
    expect(ctx.dockerfile!.path).toBe(customPath);
    expect(ctx.dockerfile!.stages[0].baseImage).toBe('alpine:3.19');
    expect(ctx.files.dockerfilePath).toBe(customPath);
  });

  it('should use explicit opts.composePath override', async () => {
    const dir = createTempDir();
    const customPath = join(dir, 'custom-compose.yaml');
    writeFileSync(
      customPath,
      `services:
  api:
    image: python:3.12
`,
    );

    const ctx = await buildContext(dir, { composePath: customPath });

    expect(ctx.compose).toBeDefined();
    expect(ctx.compose!.path).toBe(customPath);
    expect(ctx.compose!.services.length).toBe(1);
    expect(ctx.compose!.services[0].name).toBe('api');
    expect(ctx.files.composePath).toBe(customPath);
  });

  it('should set dockerAvailable as a boolean', async () => {
    const dir = createTempDir();

    const ctx = await buildContext(dir);

    expect(typeof ctx.dockerAvailable).toBe('boolean');
  });

  it('should find .sh files as shellScripts', async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, 'entrypoint.sh'), '#!/bin/bash\necho hello\n');
    writeFileSync(join(dir, 'setup.sh'), '#!/bin/bash\necho setup\n');
    writeFileSync(join(dir, 'readme.txt'), 'not a shell script\n');

    const ctx = await buildContext(dir);

    expect(ctx.files.shellScripts.length).toBe(2);
    expect(ctx.files.shellScripts).toContain(join(dir, 'entrypoint.sh'));
    expect(ctx.files.shellScripts).toContain(join(dir, 'setup.sh'));
    // Non-.sh files should not be included
    expect(ctx.files.shellScripts).not.toContain(join(dir, 'readme.txt'));
  });

  it('should detect a .gitattributes file when present', async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, '.gitattributes'), '* text=auto eol=lf\n');

    const ctx = await buildContext(dir);

    expect(ctx.files.gitattributesPath).toBe(join(dir, '.gitattributes'));
  });

  it('should detect compose.yml as a valid compose filename', async () => {
    const dir = createTempDir();
    writeFileSync(
      join(dir, 'compose.yml'),
      `services:
  db:
    image: postgres:16
`,
    );

    const ctx = await buildContext(dir);

    expect(ctx.compose).toBeDefined();
    expect(ctx.compose!.path).toBe(join(dir, 'compose.yml'));
    expect(ctx.compose!.services[0].name).toBe('db');
  });

  it('should detect compose.yaml as a valid compose filename', async () => {
    const dir = createTempDir();
    writeFileSync(
      join(dir, 'compose.yaml'),
      `services:
  cache:
    image: redis:7
`,
    );

    const ctx = await buildContext(dir);

    expect(ctx.compose).toBeDefined();
    expect(ctx.compose!.path).toBe(join(dir, 'compose.yaml'));
    expect(ctx.compose!.services[0].name).toBe('cache');
  });

  it('should parse all files together when Dockerfile, compose, and dockerignore all exist', async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, 'Dockerfile'), 'FROM node:20\nCMD ["node"]\n');
    writeFileSync(
      join(dir, 'docker-compose.yml'),
      `services:
  app:
    build: .
`,
    );
    writeFileSync(join(dir, '.dockerignore'), 'node_modules\n.git\n');
    writeFileSync(join(dir, '.gitattributes'), '* text=auto\n');
    writeFileSync(join(dir, 'start.sh'), '#!/bin/bash\nnpm start\n');

    const ctx = await buildContext(dir);

    expect(ctx.cwd).toBe(dir);
    expect(ctx.dockerfile).toBeDefined();
    expect(ctx.compose).toBeDefined();
    expect(ctx.dockerignore).toBeDefined();
    expect(ctx.files.gitattributesPath).toBeDefined();
    expect(ctx.files.shellScripts.length).toBe(1);
    expect(typeof ctx.dockerAvailable).toBe('boolean');
  });
});
