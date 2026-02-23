import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', '..', 'dist', 'bin', 'cli.js');
const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const PKG_VERSION = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf-8'),
).version;

function run(args: string, timeout = 30000): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      encoding: 'utf-8',
      timeout,
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? '', exitCode: e.status ?? 2 };
  }
}

describe('CLI integration', () => {
  it('--help prints usage', () => {
    const { stdout, exitCode } = run('--help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('dockerdoctor');
    expect(stdout).toContain('Commands:');
  });

  it('--version prints version', () => {
    const { stdout, exitCode } = run('--version');
    expect(exitCode).toBe(0);
    expect(stdout).toContain(PKG_VERSION);
  });

  // Use subcommands to avoid runtime checks that probe Docker
  it('dockerfile --json with bad Dockerfile returns warnings', () => {
    const badFile = join(FIXTURES, 'dockerfiles', 'bad.Dockerfile');
    const { stdout, exitCode } = run(`dockerfile --json -f ${badFile}`);
    // Dockerfile-category checks only produce warnings for this fixture
    // (error-severity issues like hardcoded secrets are in the 'secrets' category)
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.results).toBeDefined();
    expect(report.summary.warnings).toBeGreaterThan(0);
    expect(report.summary.total).toBeGreaterThan(0);
  });

  it('secrets --json with bad Dockerfile returns errors (exit code 1)', () => {
    const badFile = join(FIXTURES, 'dockerfiles', 'bad.Dockerfile');
    const { stdout, exitCode } = run(`secrets --json -f ${badFile}`);
    expect(exitCode).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.results).toBeDefined();
    expect(report.summary.errors).toBeGreaterThan(0);
  });

  it('dockerfile --json with good Dockerfile has no errors', () => {
    const goodFile = join(FIXTURES, 'dockerfiles', 'good.Dockerfile');
    const { stdout, exitCode } = run(`dockerfile --json -f ${goodFile}`);
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.summary.errors).toBe(0);
  });

  it('dockerfile subcommand filters to dockerfile category only', () => {
    const badFile = join(FIXTURES, 'dockerfiles', 'bad.Dockerfile');
    const { stdout } = run(`dockerfile --json -f ${badFile}`);
    const report = JSON.parse(stdout);
    for (const result of report.results) {
      expect(result.category).toBe('dockerfile');
    }
  });

  it('compose subcommand filters to compose category only', () => {
    const composeFile = join(FIXTURES, 'compose', 'bad-compose.yml');
    const { stdout } = run(`compose --json -c ${composeFile}`);
    const report = JSON.parse(stdout);
    for (const result of report.results) {
      expect(result.category).toBe('compose');
    }
  });

  it('secrets subcommand filters to secrets category', () => {
    const badFile = join(FIXTURES, 'dockerfiles', 'bad.Dockerfile');
    const composeFile = join(FIXTURES, 'compose', 'bad-compose.yml');
    const { stdout } = run(`secrets --json -f ${badFile} -c ${composeFile}`);
    const report = JSON.parse(stdout);
    for (const result of report.results) {
      expect(result.category).toBe('secrets');
    }
  });

  it('--severity error filters out warnings and info', () => {
    const badFile = join(FIXTURES, 'dockerfiles', 'bad.Dockerfile');
    const composeFile = join(FIXTURES, 'compose', 'bad-compose.yml');
    const { stdout } = run(`secrets --json --severity error -f ${badFile} -c ${composeFile}`);
    const report = JSON.parse(stdout);
    expect(report.summary.warnings).toBe(0);
    expect(report.summary.info).toBe(0);
    expect(report.summary.errors).toBeGreaterThan(0);
  });

  it('JSON output matches Report schema', () => {
    const badFile = join(FIXTURES, 'dockerfiles', 'bad.Dockerfile');
    const { stdout } = run(`dockerfile --json -f ${badFile}`);
    const report = JSON.parse(stdout);
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('version');
    expect(report).toHaveProperty('dockerAvailable');
    expect(report).toHaveProperty('results');
    expect(report).toHaveProperty('summary');
    expect(report.summary).toHaveProperty('total');
    expect(report.summary).toHaveProperty('errors');
    expect(report.summary).toHaveProperty('warnings');
    expect(report.summary).toHaveProperty('info');
    expect(report.summary).toHaveProperty('fixable');
  });
});
