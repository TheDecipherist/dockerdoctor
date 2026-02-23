import { describe, it, expect } from 'vitest';
import {
  registerCheck,
  getAllChecks,
  getChecksByCategory,
  buildContext,
  runChecks,
  parseDockerfile,
  parseCompose,
  parseDockerignore,
} from '../../src/index.js';

describe('public API exports', () => {
  it('exports registerCheck as a function', () => {
    expect(typeof registerCheck).toBe('function');
  });

  it('exports getAllChecks as a function', () => {
    expect(typeof getAllChecks).toBe('function');
  });

  it('exports getChecksByCategory as a function', () => {
    expect(typeof getChecksByCategory).toBe('function');
  });

  it('exports buildContext as a function', () => {
    expect(typeof buildContext).toBe('function');
  });

  it('exports runChecks as a function', () => {
    expect(typeof runChecks).toBe('function');
  });

  it('exports parseDockerfile as a function', () => {
    expect(typeof parseDockerfile).toBe('function');
  });

  it('exports parseCompose as a function', () => {
    expect(typeof parseCompose).toBe('function');
  });

  it('exports parseDockerignore as a function', () => {
    expect(typeof parseDockerignore).toBe('function');
  });

  it('parseDockerfile returns a ParsedDockerfile', () => {
    const result = parseDockerfile('FROM node:20\nCMD ["node"]', '/test/Dockerfile');
    expect(result).toHaveProperty('path', '/test/Dockerfile');
    expect(result).toHaveProperty('stages');
    expect(result).toHaveProperty('allInstructions');
    expect(result).toHaveProperty('raw');
    expect(result.stages).toHaveLength(1);
  });

  it('parseCompose returns a ParsedCompose', () => {
    const result = parseCompose('services:\n  web:\n    image: nginx', '/test/compose.yml');
    expect(result).toHaveProperty('path', '/test/compose.yml');
    expect(result).toHaveProperty('services');
    expect(result).toHaveProperty('networks');
    expect(result).toHaveProperty('volumes');
    expect(result.services).toHaveLength(1);
    expect(result.services[0].name).toBe('web');
  });

  it('parseDockerignore returns a ParsedDockerignore', () => {
    const result = parseDockerignore('node_modules\n.git\n!.gitkeep', '/test/.dockerignore');
    expect(result).toHaveProperty('path', '/test/.dockerignore');
    expect(result).toHaveProperty('entries');
    expect(result.entries).toHaveLength(3);
    expect(result.entries[2].negation).toBe(true);
  });
});
