import { describe, it, expect } from 'vitest';
import { normalizeArgs } from '../../../src/checks/utils.js';

describe('normalizeArgs', () => {
  it('should convert JSON array to space-joined string', () => {
    expect(normalizeArgs('[".","."]')).toBe('. .');
    expect(normalizeArgs('["package.json","./"]')).toBe('package.json ./');
    expect(normalizeArgs('["package*.json","./"]')).toBe('package*.json ./');
    expect(normalizeArgs('["API_KEY=sk-123"]')).toBe('API_KEY=sk-123');
  });

  it('should convert JSON object to KEY=val pairs', () => {
    expect(normalizeArgs('{"NODE_ENV":"production"}')).toBe('NODE_ENV=production');
    expect(normalizeArgs('{"DB_PASSWORD":"supersecret123"}')).toBe('DB_PASSWORD=supersecret123');
    expect(normalizeArgs('{"KEY1":"val1","KEY2":"val2"}')).toBe('KEY1=val1 KEY2=val2');
  });

  it('should return plain strings unchanged', () => {
    expect(normalizeArgs('. .')).toBe('. .');
    expect(normalizeArgs('NODE_ENV=production')).toBe('NODE_ENV=production');
    expect(normalizeArgs('npm ci')).toBe('npm ci');
  });

  it('should return invalid JSON unchanged', () => {
    expect(normalizeArgs('{not valid json')).toBe('{not valid json');
    expect(normalizeArgs('["unclosed')).toBe('["unclosed');
  });

  it('should trim whitespace', () => {
    expect(normalizeArgs('  [".","."]  ')).toBe('. .');
    expect(normalizeArgs('  plain string  ')).toBe('plain string');
  });
});
