import { describe, it, expect, beforeAll } from 'vitest';
import { parseCompose } from '../../../src/parsers/compose.js';
import { getChecksByCategory } from '../../../src/checks/registry.js';
import type { CheckContext, Check } from '../../../src/types/index.js';

// Side-effect import to register all compose checks
import '../../../src/checks/compose/index.js';

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
  const checks = getChecksByCategory('compose');
  const check = checks.find((c) => c.id === id);
  if (!check) throw new Error(`Check "${id}" not found. Available: ${checks.map((c) => c.id).join(', ')}`);
  return check;
}

describe('compose checks', () => {
  let checks: Check[];

  beforeAll(() => {
    checks = getChecksByCategory('compose');
  });

  it('should have all 5 compose checks registered', () => {
    expect(checks.length).toBe(5);
  });

  // --- compose.static-ip ---
  describe('compose.static-ip', () => {
    const check = findCheck('compose.static-ip');

    it('should flag static IPv4 address', async () => {
      const raw = `
services:
  web:
    image: nginx
    networks:
      frontend:
        ipv4_address: 172.20.0.10
networks:
  frontend:
    driver: bridge
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('compose.static-ip');
      expect(results[0].severity).toBe('warning');
    });

    it('should flag static IPv6 address', async () => {
      const raw = `
services:
  web:
    image: nginx
    networks:
      frontend:
        ipv6_address: "2001:db8::10"
networks:
  frontend:
    driver: bridge
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should not flag networks as array (no IP config)', async () => {
      const raw = `
services:
  web:
    image: nginx
    networks:
      - frontend
      - backend
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag network without static IP', async () => {
      const raw = `
services:
  web:
    image: nginx
    networks:
      frontend: {}
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
  });

  // --- compose.swarm-ignored ---
  describe('compose.swarm-ignored', () => {
    const check = findCheck('compose.swarm-ignored');

    it('should flag swarm-ignored keys when deploy is present', async () => {
      const raw = `
services:
  web:
    image: nginx
    restart: always
    container_name: my-web
    deploy:
      replicas: 3
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('compose.swarm-ignored');
      expect(results[0].severity).toBe('info');
      expect((results[0].meta?.ignoredKeys as string[]) ?? []).toContain('restart');
      expect((results[0].meta?.ignoredKeys as string[]) ?? []).toContain('container_name');
    });

    it('should not flag when no deploy key', async () => {
      const raw = `
services:
  web:
    image: nginx
    restart: always
    container_name: my-web
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag deploy-only service (no ignored keys)', async () => {
      const raw = `
services:
  web:
    image: nginx
    deploy:
      replicas: 3
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should flag depends_on and build with deploy', async () => {
      const raw = `
services:
  web:
    build: .
    depends_on:
      - db
    deploy:
      replicas: 2
  db:
    image: postgres
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      // web service has deploy + depends_on + build
      expect(results).toHaveLength(1);
      expect((results[0].meta?.ignoredKeys as string[]) ?? []).toContain('depends_on');
      expect((results[0].meta?.ignoredKeys as string[]) ?? []).toContain('build');
    });
  });

  // --- compose.missing-healthcheck ---
  describe('compose.missing-healthcheck', () => {
    const check = findCheck('compose.missing-healthcheck');

    it('should flag service with ports but no healthcheck', async () => {
      const raw = `
services:
  web:
    image: nginx
    ports:
      - "80:80"
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('compose.missing-healthcheck');
      expect(results[0].severity).toBe('warning');
    });

    it('should not flag service with healthcheck', async () => {
      const raw = `
services:
  web:
    image: nginx
    ports:
      - "80:80"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag service without ports', async () => {
      const raw = `
services:
  worker:
    image: myapp
    command: ["node", "worker.js"]
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag service with profiles', async () => {
      const raw = `
services:
  debug:
    image: myapp
    ports:
      - "9229:9229"
    profiles:
      - debug
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });
  });

  // --- compose.bridge-network ---
  describe('compose.bridge-network', () => {
    const check = findCheck('compose.bridge-network');

    it('should flag bridge driver network', async () => {
      const raw = `
services:
  web:
    image: nginx
networks:
  frontend:
    driver: bridge
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('compose.bridge-network');
      expect(results[0].severity).toBe('info');
    });

    it('should not flag overlay driver network', async () => {
      const raw = `
services:
  web:
    image: nginx
networks:
  frontend:
    driver: overlay
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag network without explicit driver', async () => {
      const raw = `
services:
  web:
    image: nginx
networks:
  frontend: {}
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should flag multiple bridge networks', async () => {
      const raw = `
services:
  web:
    image: nginx
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(2);
    });
  });

  // --- compose.bind-mounts ---
  describe('compose.bind-mounts', () => {
    const check = findCheck('compose.bind-mounts');

    it('should flag bind mounts with ./ prefix', async () => {
      const raw = `
services:
  web:
    image: nginx
    volumes:
      - ./src:/app/src
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('compose.bind-mounts');
      expect(results[0].severity).toBe('info');
    });

    it('should flag bind mounts with absolute path', async () => {
      const raw = `
services:
  web:
    image: nginx
    volumes:
      - /data/app:/app/data
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should not flag named volumes', async () => {
      const raw = `
services:
  db:
    image: postgres
    volumes:
      - db-data:/var/lib/postgresql/data
volumes:
  db-data:
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should not flag service without volumes', async () => {
      const raw = `
services:
  web:
    image: nginx
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(0);
    });

    it('should flag bind mounts with .. prefix', async () => {
      const raw = `
services:
  web:
    image: nginx
    volumes:
      - ../shared:/app/shared
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });

    it('should flag dot bind mount', async () => {
      const raw = `
services:
  web:
    image: nginx
    volumes:
      - .:/app
`;
      const compose = parseCompose(raw, '/test/docker-compose.yml');
      const ctx = makeContext({ compose });
      const results = await check.run(ctx);

      expect(results).toHaveLength(1);
    });
  });
});
