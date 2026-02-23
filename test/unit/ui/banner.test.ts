import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockLog = { info: vi.fn() };
vi.mock('@clack/prompts', () => ({
  intro: mockIntro,
  outro: mockOutro,
  log: mockLog,
}));

vi.mock('../../../src/telemetry.js', () => ({
  getUpdateInfo: vi.fn().mockResolvedValue(null),
}));

describe('banner', () => {
  let showBanner: typeof import('../../../src/ui/banner.js').showBanner;
  let showContext: typeof import('../../../src/ui/banner.js').showContext;
  let showOutro: typeof import('../../../src/ui/banner.js').showOutro;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import('../../../src/ui/banner.js');
    showBanner = mod.showBanner;
    showContext = mod.showContext;
    showOutro = mod.showOutro;
  });

  describe('showBanner', () => {
    it('should call intro() with a string containing the version', () => {
      showBanner('1.2.3');

      expect(mockIntro).toHaveBeenCalledTimes(1);
      const arg = mockIntro.mock.calls[0][0] as string;
      expect(arg).toContain('dockerdoctor');
      expect(arg).toContain('v1.2.3');
    });
  });

  describe('showContext', () => {
    it('should print Dockerfile path when found', () => {
      showContext({
        dockerfilePath: '/project/Dockerfile',
        dockerAvailable: false,
      });

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c.join(' '))
        .join('\n');
      expect(output).toContain('Dockerfile');
      expect(output).toContain('/project/Dockerfile');
    });

    it('should print "No Dockerfile found" when not present', () => {
      showContext({
        dockerAvailable: false,
      });

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c.join(' '))
        .join('\n');
      expect(output).toContain('No Dockerfile found');
    });

    it('should print compose path when found', () => {
      showContext({
        composePath: '/project/docker-compose.yml',
        dockerAvailable: false,
      });

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c.join(' '))
        .join('\n');
      expect(output).toContain('Compose');
      expect(output).toContain('/project/docker-compose.yml');
    });

    it('should print "No compose file found" when not present', () => {
      showContext({
        dockerAvailable: false,
      });

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c.join(' '))
        .join('\n');
      expect(output).toContain('No compose file found');
    });

    it('should print ".dockerignore found" when present', () => {
      showContext({
        dockerignorePath: '/project/.dockerignore',
        dockerAvailable: false,
      });

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c.join(' '))
        .join('\n');
      expect(output).toContain('.dockerignore found');
    });

    it('should print "No .dockerignore found" when not present', () => {
      showContext({
        dockerAvailable: false,
      });

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c.join(' '))
        .join('\n');
      expect(output).toContain('No .dockerignore found');
    });

    it('should print "Docker: connected" when Docker is available', () => {
      showContext({
        dockerAvailable: true,
      });

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c.join(' '))
        .join('\n');
      expect(output).toContain('Docker: connected');
    });

    it('should print "Docker: not available" when Docker is unavailable', () => {
      showContext({
        dockerAvailable: false,
      });

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c.join(' '))
        .join('\n');
      expect(output).toContain('Docker: not available');
    });
  });

  describe('showOutro', () => {
    it('should call outro() with a string containing the message', async () => {
      await showOutro('Done scanning!');

      expect(mockOutro).toHaveBeenCalledTimes(1);
      const arg = mockOutro.mock.calls[0][0] as string;
      expect(arg).toContain('Done scanning!');
    });
  });
});
