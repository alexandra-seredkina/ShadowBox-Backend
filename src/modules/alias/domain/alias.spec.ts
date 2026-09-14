import {
  Alias,
  AliasId,
  expiresAtFor,
  fromAliasSnapshot,
  toAliasSnapshot,
} from './alias.js';

const NOW = new Date('2020-01-15T12:00:00Z');

describe('expiresAtFor', () => {
  it.each([
    ['1h', 60 * 60 * 1000],
    ['24h', 24 * 60 * 60 * 1000],
    ['7d', 7 * 24 * 60 * 60 * 1000],
    ['30d', 30 * 24 * 60 * 60 * 1000],
  ] as const)('gives a %s address its lifetime from now', (ttl, ms) => {
    expect(expiresAtFor({ kind: 'temporary', ttl }, NOW)).toEqual(
      new Date(NOW.getTime() + ms),
    );
  });

  it('never expires a permanent address', () => {
    expect(expiresAtFor({ kind: 'permanent' }, NOW)).toBeNull();
  });
});

describe('alias snapshot', () => {
  const alias: Alias = {
    id: '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0d' as AliasId,
    localPart: 'k7f3mz9q2a',
    domain: 'shadowbox.test',
    kind: 'temporary',
    status: 'active',
    encryptedLabel: {
      v: 1,
      alg: 'x25519-xchacha20poly1305',
      sealedKey: 'a',
      nonce: 'b',
      ciphertext: 'c',
    },
    folderId: null,
    expiresAt: new Date('2020-01-22T12:00:00.123Z'),
    createdAt: NOW,
    lastReceivedAt: null,
  };

  it('survives a JSON round trip', () => {
    const stored: unknown = JSON.parse(JSON.stringify(toAliasSnapshot(alias)));

    expect(fromAliasSnapshot(stored)).toEqual(alias);
  });

  it('refuses a snapshot of another shape', () => {
    expect(() => fromAliasSnapshot({ id: 'x' })).toThrow();
  });
});
