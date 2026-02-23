import { describe, it, expect } from 'vitest';
import { parseDockerignore, hasEntry } from '../../../src/parsers/dockerignore.js';

describe('parseDockerignore', () => {
  it('should parse basic patterns', () => {
    const raw = `node_modules
.git
.env
dist
`;
    const result = parseDockerignore(raw, '/test/.dockerignore');

    expect(result.path).toBe('/test/.dockerignore');
    expect(result.raw).toBe(raw);
    expect(result.entries).toHaveLength(4);
    expect(result.entries.map((e) => e.pattern)).toEqual([
      'node_modules',
      '.git',
      '.env',
      'dist',
    ]);
  });

  it('should skip empty lines', () => {
    const raw = `node_modules

.git

.env
`;
    const result = parseDockerignore(raw, '/test/.dockerignore');

    expect(result.entries).toHaveLength(3);
  });

  it('should skip comment lines', () => {
    const raw = `# Dependencies
node_modules
# Version control
.git
# Environment
.env
`;
    const result = parseDockerignore(raw, '/test/.dockerignore');

    expect(result.entries).toHaveLength(3);
    // None of the entries should be comments
    for (const entry of result.entries) {
      expect(entry.pattern.startsWith('#')).toBe(false);
    }
  });

  it('should handle negation patterns', () => {
    const raw = `*
!src
!package.json
`;
    const result = parseDockerignore(raw, '/test/.dockerignore');

    expect(result.entries).toHaveLength(3);

    expect(result.entries[0].pattern).toBe('*');
    expect(result.entries[0].negation).toBe(false);

    expect(result.entries[1].pattern).toBe('src');
    expect(result.entries[1].negation).toBe(true);

    expect(result.entries[2].pattern).toBe('package.json');
    expect(result.entries[2].negation).toBe(true);
  });

  it('should track correct line numbers', () => {
    const raw = `# Comment line 1
node_modules
# Comment line 3

.git
`;
    const result = parseDockerignore(raw, '/test/.dockerignore');

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].line).toBe(2); // node_modules
    expect(result.entries[1].line).toBe(5); // .git
  });

  it('should trim whitespace from patterns', () => {
    const raw = `  node_modules
  .git
`;
    const result = parseDockerignore(raw, '/test/.dockerignore');

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].pattern).toBe('node_modules');
    expect(result.entries[1].pattern).toBe('.git');
  });

  it('should handle empty content', () => {
    const result = parseDockerignore('', '/test/.dockerignore');

    expect(result.entries).toHaveLength(0);
  });

  it('should handle content with only comments and empty lines', () => {
    const raw = `# Comment
# Another comment

`;
    const result = parseDockerignore(raw, '/test/.dockerignore');

    expect(result.entries).toHaveLength(0);
  });
});

describe('hasEntry', () => {
  it('should return true when pattern is present', () => {
    const parsed = parseDockerignore('node_modules\n.git\n.env\n', '/test/.dockerignore');

    expect(hasEntry(parsed, 'node_modules')).toBe(true);
    expect(hasEntry(parsed, '.git')).toBe(true);
    expect(hasEntry(parsed, '.env')).toBe(true);
  });

  it('should return false when pattern is absent', () => {
    const parsed = parseDockerignore('node_modules\n.git\n', '/test/.dockerignore');

    expect(hasEntry(parsed, '.env')).toBe(false);
    expect(hasEntry(parsed, 'dist')).toBe(false);
  });

  it('should match patterns with trailing slash', () => {
    const raw = `node_modules/
.git/
`;
    const parsed = parseDockerignore(raw, '/test/.dockerignore');

    // hasEntry checks if e.pattern === pattern || e.pattern === pattern + '/'
    // The parsed pattern will be "node_modules/" (since the raw line is "node_modules/")
    // So hasEntry(parsed, 'node_modules') should match because e.pattern === 'node_modules/'
    expect(hasEntry(parsed, 'node_modules')).toBe(true);
    expect(hasEntry(parsed, '.git')).toBe(true);
  });

  it('should not match negated patterns', () => {
    const raw = `*
!node_modules
`;
    const parsed = parseDockerignore(raw, '/test/.dockerignore');

    // The negated entry should not count as having the entry
    expect(hasEntry(parsed, 'node_modules')).toBe(false);
    // But the wildcard (non-negated) should match
    expect(hasEntry(parsed, '*')).toBe(true);
  });

  it('should return false for an empty dockerignore', () => {
    const parsed = parseDockerignore('', '/test/.dockerignore');

    expect(hasEntry(parsed, 'node_modules')).toBe(false);
  });
});
