import { createTestConfig } from '../../../../test/support/test-config.js';
import type { Login } from '../domain/login.js';
import { HmacDecoySaltSource } from './hmac-decoy-salt.source.js';

describe('HmacDecoySaltSource', () => {
  const source = new HmacDecoySaltSource(createTestConfig());

  it('derives a 16-byte salt', () => {
    expect(source.saltFor('kage' as Login)).toHaveLength(16);
  });

  it('is deterministic for a login', () => {
    expect(source.saltFor('kage' as Login)).toEqual(
      source.saltFor('kage' as Login),
    );
  });

  it('differs between logins', () => {
    expect(source.saltFor('kage' as Login)).not.toEqual(
      source.saltFor('kage2' as Login),
    );
  });

  it('depends on the server key', () => {
    const otherKey = new HmacDecoySaltSource(
      createTestConfig({ preloginSaltKey: new Uint8Array(32).fill(1) }),
    );

    expect(otherKey.saltFor('kage' as Login)).not.toEqual(
      source.saltFor('kage' as Login),
    );
  });
});
