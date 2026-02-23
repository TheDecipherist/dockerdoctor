import { describe, it, expect } from 'vitest';
import { parseCompose } from '../../../src/parsers/compose.js';

describe('parseCompose', () => {
  describe('basic parsing', () => {
    it('should parse a simple compose file with one service', () => {
      const raw = `
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.path).toBe('/test/docker-compose.yml');
      expect(result.raw).toBe(raw);
      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('web');
      expect(result.services[0].image).toBe('nginx:latest');
      expect(result.services[0].ports).toEqual(['80:80']);
    });

    it('should parse multiple services', () => {
      const raw = `
services:
  web:
    image: nginx:latest
  db:
    image: postgres:16
  redis:
    image: redis:7
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.services).toHaveLength(3);
      const names = result.services.map((s) => s.name);
      expect(names).toContain('web');
      expect(names).toContain('db');
      expect(names).toContain('redis');
    });

    it('should parse version field if present', () => {
      const raw = `
version: "3.8"
services:
  web:
    image: nginx
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.version).toBe('3.8');
    });

    it('should handle missing version field', () => {
      const raw = `
services:
  web:
    image: nginx
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.version).toBeUndefined();
    });
  });

  describe('networks', () => {
    it('should parse top-level networks', () => {
      const raw = `
services:
  web:
    image: nginx
networks:
  frontend:
    driver: bridge
  backend:
    driver: overlay
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.networks).toBeDefined();
      expect(result.networks).toHaveProperty('frontend');
      expect(result.networks).toHaveProperty('backend');
      expect((result.networks.frontend as Record<string, unknown>).driver).toBe('bridge');
      expect((result.networks.backend as Record<string, unknown>).driver).toBe('overlay');
    });

    it('should return empty networks when none defined', () => {
      const raw = `
services:
  web:
    image: nginx
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.networks).toEqual({});
    });
  });

  describe('volumes', () => {
    it('should parse top-level volumes', () => {
      const raw = `
services:
  db:
    image: postgres
    volumes:
      - db-data:/var/lib/postgresql/data
volumes:
  db-data:
    driver: local
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.volumes).toBeDefined();
      expect(result.volumes).toHaveProperty('db-data');
    });

    it('should return empty volumes when none defined', () => {
      const raw = `
services:
  web:
    image: nginx
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.volumes).toEqual({});
    });
  });

  describe('service properties', () => {
    it('should parse build configuration (string form)', () => {
      const raw = `
services:
  web:
    build: .
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.services[0].build).toBe('.');
    });

    it('should parse build configuration (object form)', () => {
      const raw = `
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile.prod
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      const build = result.services[0].build as Record<string, string>;
      expect(build.context).toBe('.');
      expect(build.dockerfile).toBe('Dockerfile.prod');
    });

    it('should parse environment as map', () => {
      const raw = `
services:
  web:
    image: nginx
    environment:
      NODE_ENV: production
      PORT: "3000"
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      const env = result.services[0].environment as Record<string, string>;
      expect(env.NODE_ENV).toBe('production');
      expect(env.PORT).toBe('3000');
    });

    it('should parse environment as array', () => {
      const raw = `
services:
  web:
    image: nginx
    environment:
      - NODE_ENV=production
      - PORT=3000
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      const env = result.services[0].environment as string[];
      expect(env).toContain('NODE_ENV=production');
      expect(env).toContain('PORT=3000');
    });

    it('should parse healthcheck', () => {
      const raw = `
services:
  web:
    image: nginx
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
      timeout: 10s
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.services[0].healthcheck).toBeDefined();
    });

    it('should parse depends_on as array', () => {
      const raw = `
services:
  web:
    image: nginx
    depends_on:
      - db
      - redis
  db:
    image: postgres
  redis:
    image: redis
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      const web = result.services.find((s) => s.name === 'web');
      expect(web!.depends_on).toEqual(['db', 'redis']);
    });

    it('should parse deploy section', () => {
      const raw = `
services:
  web:
    image: nginx
    deploy:
      replicas: 3
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.services[0].deploy).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should return empty result for null/invalid YAML', () => {
      const result = parseCompose('', '/test/docker-compose.yml');

      expect(result.services).toEqual([]);
      expect(result.networks).toEqual({});
      expect(result.volumes).toEqual({});
    });

    it('should return empty services when no services key', () => {
      const raw = `
networks:
  frontend:
    driver: bridge
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.services).toEqual([]);
    });

    it('should handle a service with no configuration', () => {
      const raw = `
services:
  web: {}
`;
      const result = parseCompose(raw, '/test/docker-compose.yml');

      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('web');
    });
  });
});
