import { createTestConfig } from '../../../../test/support/test-config.js';
import type { MessageOwnerId } from '../domain/message.js';
import { HmacSenderHasher } from './hmac-sender-hasher.js';

const KAGE = 'account-1' as MessageOwnerId;
const OTHER = 'account-2' as MessageOwnerId;

describe('HmacSenderHasher', () => {
  const hasher = new HmacSenderHasher(
    createTestConfig({ senderHashKeyVersion: 3 }),
  );

  it('gives the same hash for the same sender regardless of case', () => {
    expect(hasher.hash(KAGE, ' News@Shop.Example ')).toEqual(
      hasher.hash(KAGE, 'news@shop.example'),
    );
  });

  it('gives unrelated hashes for the same sender in another account', () => {
    expect(hasher.hash(KAGE, 'news@shop.example').hash).not.toEqual(
      hasher.hash(OTHER, 'news@shop.example').hash,
    );
  });

  it('depends on the key and carries its version', () => {
    const otherKey = new HmacSenderHasher(
      createTestConfig({ senderHashKey: new Uint8Array(32).fill(99) }),
    );
    const hashed = hasher.hash(KAGE, 'news@shop.example');

    expect(hashed.keyVersion).toBe(3);
    expect(hashed.hash).toHaveLength(32);
    expect(otherKey.hash(KAGE, 'news@shop.example').hash).not.toEqual(
      hashed.hash,
    );
  });
});
