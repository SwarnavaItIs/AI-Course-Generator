import { describe, expect, it } from 'vitest';
import { parseConfig } from '../server/src/config.js';
const config = {
  CLIENT_ORIGINS: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost/test',
  AUTH0_DOMAIN: 'tenant.auth0.com',
  AUTH0_AUDIENCE: 'https://test-api',
};
describe('startup configuration', () => {
  it('requires auth and database configuration without exposing values', () => {
    expect(() => parseConfig({ MONGODB_URI: 'private-secret-value' })).toThrow('MONGODB_URI');
    try {
      parseConfig({ MONGODB_URI: 'private-secret-value' });
    } catch (error) {
      expect(String(error)).not.toContain('private-secret-value');
    }
  });
  it('validates ports, origins, domains, and production transport', () => {
    expect(parseConfig(config).PORT).toBe(3001);
    expect(() => parseConfig({ ...config, PORT: '0' })).toThrow('PORT');
    expect(() => parseConfig({ ...config, AUTH0_DOMAIN: 'https://tenant.auth0.com/' })).toThrow(
      'AUTH0_DOMAIN',
    );
    expect(() => parseConfig({ ...config, CLIENT_ORIGINS: 'http://localhost:5173/path' })).toThrow(
      'CLIENT_ORIGINS',
    );
    expect(() => parseConfig({ ...config, NODE_ENV: 'production' })).toThrow('CLIENT_ORIGINS');
    expect(
      parseConfig({ ...config, NODE_ENV: 'production', CLIENT_ORIGINS: 'https://app.example.com' })
        .NODE_ENV,
    ).toBe('production');
  });
});
