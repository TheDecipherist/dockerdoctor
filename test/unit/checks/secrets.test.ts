import { describe, it, expect, beforeAll } from 'vitest';
import { parseDockerfile } from '../../../src/parsers/dockerfile.js';
import { parseCompose } from '../../../src/parsers/compose.js';
import { getChecksByCategory } from '../../../src/checks/registry.js';
import type { CheckContext, Check } from '../../../src/types/index.js';

// Side-effect import to register all secrets checks
import '../../../src/checks/secrets/index.js';

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
  const checks = getChecksByCategory('secrets');
  const check = checks.find((c) => c.id === id);
  if (!check) throw new Error(`Check "${id}" not found. Available: ${checks.map((c) => c.id).join(', ')}`);
  return check;
}

describe('secrets checks', () => {
  let checks: Check[];

  beforeAll(() => {
    checks = getChecksByCategory('secrets');
  });

  it('should have all 4 secrets checks registered', () => {
    expect(checks.length).toBe(4);
  });

  // --- secrets.dockerfile-env ---
  describe('secrets.dockerfile-env', () => {
    const check = findCheck('secrets.dockerfile-env');

    it('should detect secrets from parsed ENV=syntax (JSON-stringified args)', async () => {
      const raw = `FROM node:20
ENV DB_PASSWORD=supersecret123
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('secrets.dockerfile-env');
      expect(results[0].severity).toBe('error');
    });

    it('should flag hardcoded password in ENV (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ENV', args: 'DB_PASSWORD=supersecret123', lineno: 2, raw: 'ENV DB_PASSWORD=supersecret123' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('secrets.dockerfile-env');
      expect(results[0].severity).toBe('error');
    });

    it('should flag hardcoded API key in ENV (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ENV', args: 'API_KEY=abc123def456', lineno: 2, raw: 'ENV API_KEY=abc123def456' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should flag hardcoded token in ENV (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ENV', args: 'AUTH_TOKEN=mytoken123', lineno: 2, raw: 'ENV AUTH_TOKEN=mytoken123' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should not flag ENV with variable reference (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ENV', args: 'DB_PASSWORD=$DB_PASSWORD', lineno: 2, raw: 'ENV DB_PASSWORD=$DB_PASSWORD' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag ENV with placeholder values (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ENV', args: 'DB_PASSWORD=changeme', lineno: 2, raw: 'ENV DB_PASSWORD=changeme' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag non-secret ENV variables (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ENV', args: 'NODE_ENV=production', lineno: 2, raw: 'ENV NODE_ENV=production' },
          { name: 'ENV', args: 'PORT=3000', lineno: 3, raw: 'ENV PORT=3000' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should handle space-separated ENV format (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ENV', args: 'SECRET myvalue', lineno: 2, raw: 'ENV SECRET myvalue' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should return empty if no dockerfile', async () => {
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });
  });

  // --- secrets.dockerfile-arg ---
  describe('secrets.dockerfile-arg', () => {
    const check = findCheck('secrets.dockerfile-arg');

    // NOTE: docker-file-parser returns ARG args as arrays like ["DB_PASSWORD=value"],
    // which get JSON-stringified to '["DB_PASSWORD=value"]'. The dockerfile-arg
    // check parses the args string directly looking for KEY=value format with
    // indexOf('='). The JSON brackets and quotes cause different parsing than
    // expected for plain string args. We test both behaviors.

    it('should flag ARG with hardcoded secret default (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ARG', args: 'DB_PASSWORD=supersecret123', lineno: 2, raw: 'ARG DB_PASSWORD=supersecret123' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('secrets.dockerfile-arg');
      expect(results[0].severity).toBe('error');
    });

    it('should not flag ARG without default value (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ARG', args: 'DB_PASSWORD', lineno: 2, raw: 'ARG DB_PASSWORD' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag ARG with empty default (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ARG', args: 'DB_PASSWORD=', lineno: 2, raw: 'ARG DB_PASSWORD=' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag ARG with variable reference default (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ARG', args: 'API_KEY=$EXTERNAL_KEY', lineno: 2, raw: 'ARG API_KEY=$EXTERNAL_KEY' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag non-secret ARG variables (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ARG', args: 'NODE_VERSION=20', lineno: 2, raw: 'ARG NODE_VERSION=20' },
          { name: 'ARG', args: 'APP_NAME=myapp', lineno: 3, raw: 'ARG APP_NAME=myapp' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should handle quoted default values (string args)', async () => {
      const dockerfile = {
        path: '/test/Dockerfile',
        raw: '',
        stages: [],
        allInstructions: [
          { name: 'FROM', args: 'node:20', lineno: 1, raw: 'FROM node:20' },
          { name: 'ARG', args: 'SECRET_KEY="my-secret-value"', lineno: 2, raw: 'ARG SECRET_KEY="my-secret-value"' },
        ],
      };
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should not flag ARG without default from parsed Dockerfile', async () => {
      const raw = `FROM node:20
ARG DB_PASSWORD
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });
  });

  // --- secrets.compose-env ---
  describe('secrets.compose-env', () => {
    const check = findCheck('secrets.compose-env');

    it('should flag plaintext secret in environment (map format)', async () => {
      const raw = `
services:
  web:
    image: myapp
    environment:
      DB_PASSWORD: supersecret123
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('secrets.compose-env');
      expect(results[0].severity).toBe('error');
    });

    it('should flag plaintext secret in environment (array format)', async () => {
      const raw = `
services:
  web:
    image: myapp
    environment:
      - DB_PASSWORD=supersecret123
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should not flag variable references in environment', async () => {
      const raw = `
services:
  web:
    image: myapp
    environment:
      DB_PASSWORD: \${DB_PASSWORD}
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag non-secret variables', async () => {
      const raw = `
services:
  web:
    image: myapp
    environment:
      NODE_ENV: production
      PORT: "3000"
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag placeholder values', async () => {
      const raw = `
services:
  web:
    image: myapp
    environment:
      DB_PASSWORD: changeme
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should return empty if no compose', async () => {
      const ctx = makeContext();
      const results = await check.run(ctx);
      expect(results).toHaveLength(0);
    });

    it('should flag multiple secrets across services', async () => {
      const raw = `
services:
  web:
    image: myapp
    environment:
      API_KEY: realkey123
  db:
    image: postgres
    environment:
      POSTGRES_PASSWORD: dbpass456
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(2);
    });
  });

  // --- secrets.sensitive-copy ---
  describe('secrets.sensitive-copy', () => {
    const check = findCheck('secrets.sensitive-copy');

    it('should flag COPY of .env file', async () => {
      const raw = `FROM node:20
COPY .env /app/.env
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('secrets.sensitive-copy');
      expect(results[0].severity).toBe('error');
    });

    it('should flag COPY of .pem file', async () => {
      const raw = `FROM node:20
COPY server.pem /app/certs/
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should flag COPY of .key file', async () => {
      const raw = `FROM node:20
COPY private.key /app/
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should flag COPY of id_rsa', async () => {
      const raw = `FROM node:20
COPY id_rsa /root/.ssh/id_rsa
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should flag ADD of sensitive files', async () => {
      const raw = `FROM node:20
ADD .npmrc /app/.npmrc
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should flag COPY of .ssh directory', async () => {
      const raw = `FROM node:20
COPY .ssh/ /root/.ssh/
`;
      const dockerfile = parseDockerfile(raw, '/test/Dockerfile');
      const ctx = makeContext({ dockerfile });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should not flag COPY of non-sensitive files', async () => {
      const raw = `FROM node:20
COPY package.json /app/
COPY src/ /app/src/
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
  });
});
