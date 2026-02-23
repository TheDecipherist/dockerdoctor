import { describe, it, expect } from 'vitest';
import { parseDockerfile } from '../../../src/parsers/dockerfile.js';

describe('parseDockerfile', () => {
  describe('single-stage Dockerfile', () => {
    it('should parse a basic single-stage Dockerfile', () => {
      const raw = `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "index.js"]
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      expect(result.path).toBe('/test/Dockerfile');
      expect(result.raw).toBe(raw);
      expect(result.stages).toHaveLength(1);

      const stage = result.stages[0];
      expect(stage.baseImage).toBe('node:20-slim');
      expect(stage.name).toBeUndefined();
      expect(stage.instructions.length).toBeGreaterThanOrEqual(5);
      // FROM is always the first instruction in the stage
      expect(stage.instructions[0].name).toBe('FROM');
    });

    it('should collect all instructions in allInstructions', () => {
      const raw = `FROM node:20
RUN echo "hello"
CMD ["node", "index.js"]
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      expect(result.allInstructions.length).toBeGreaterThanOrEqual(3);
      const names = result.allInstructions.map((i) => i.name);
      expect(names).toContain('FROM');
      expect(names).toContain('RUN');
      expect(names).toContain('CMD');
    });

    it('should parse line numbers correctly', () => {
      const raw = `FROM node:20
WORKDIR /app
RUN npm ci
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      for (const instr of result.allInstructions) {
        expect(instr.lineno).toBeGreaterThan(0);
      }
    });
  });

  describe('multi-stage Dockerfile', () => {
    it('should parse a multi-stage Dockerfile with AS aliases', () => {
      const raw = `FROM node:20 AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:20-slim AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      expect(result.stages).toHaveLength(2);

      expect(result.stages[0].baseImage).toBe('node:20');
      expect(result.stages[0].name).toBe('builder');

      expect(result.stages[1].baseImage).toBe('node:20-slim');
      expect(result.stages[1].name).toBe('production');
    });

    it('should handle multi-stage without aliases', () => {
      const raw = `FROM node:20
RUN npm ci

FROM node:20-slim
COPY --from=0 /app/dist ./dist
CMD ["node", "dist/index.js"]
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      expect(result.stages).toHaveLength(2);
      expect(result.stages[0].name).toBeUndefined();
      expect(result.stages[1].name).toBeUndefined();
      expect(result.stages[0].baseImage).toBe('node:20');
      expect(result.stages[1].baseImage).toBe('node:20-slim');
    });

    it('should assign instructions to the correct stage', () => {
      const raw = `FROM node:20 AS builder
RUN echo "stage1"

FROM node:20-slim
RUN echo "stage2"
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      expect(result.stages).toHaveLength(2);

      // First stage has FROM + RUN
      const stage1Instrs = result.stages[0].instructions.map((i) => i.args);
      expect(stage1Instrs.some((a) => a.includes('stage1'))).toBe(true);

      // Second stage has FROM + RUN
      const stage2Instrs = result.stages[1].instructions.map((i) => i.args);
      expect(stage2Instrs.some((a) => a.includes('stage2'))).toBe(true);
    });
  });

  describe('no-FROM Dockerfile', () => {
    it('should handle a Dockerfile with no FROM instruction', () => {
      const raw = `RUN echo "hello"
COPY . .
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      // Should create a single unnamed stage with empty baseImage
      expect(result.stages).toHaveLength(1);
      expect(result.stages[0].baseImage).toBe('');
      expect(result.stages[0].name).toBeUndefined();
      expect(result.stages[0].instructions.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty stages for empty content', () => {
      const raw = '';
      const result = parseDockerfile(raw, '/test/Dockerfile');

      expect(result.stages).toHaveLength(0);
      expect(result.allInstructions).toHaveLength(0);
    });

    it('should return empty stages for comment-only content', () => {
      const raw = `# This is a comment
# Another comment
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      // docker-file-parser with includeComments: false skips comments
      expect(result.stages).toHaveLength(0);
      expect(result.allInstructions).toHaveLength(0);
    });
  });

  describe('instruction parsing details', () => {
    it('should uppercase instruction names', () => {
      const raw = `FROM node:20
run echo "hello"
copy . .
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      for (const instr of result.allInstructions) {
        expect(instr.name).toBe(instr.name.toUpperCase());
      }
    });

    it('should preserve raw instruction text', () => {
      const raw = `FROM node:20
RUN npm ci --production
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      const runInstr = result.allInstructions.find((i) => i.name === 'RUN');
      expect(runInstr).toBeDefined();
      expect(runInstr!.raw).toContain('npm ci');
    });

    it('should handle FROM with case-insensitive AS keyword', () => {
      const raw = `FROM node:20 as builder
WORKDIR /app
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      expect(result.stages).toHaveLength(1);
      expect(result.stages[0].name).toBe('builder');
      expect(result.stages[0].baseImage).toBe('node:20');
    });

    it('should set startLine for each stage', () => {
      const raw = `FROM node:20
RUN echo "a"

FROM alpine:3.18
RUN echo "b"
`;
      const result = parseDockerfile(raw, '/test/Dockerfile');

      expect(result.stages).toHaveLength(2);
      expect(result.stages[0].startLine).toBeGreaterThan(0);
      expect(result.stages[1].startLine).toBeGreaterThan(result.stages[0].startLine);
    });
  });
});
