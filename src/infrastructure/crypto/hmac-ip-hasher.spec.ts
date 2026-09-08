import { createTestConfig } from '../../../test/support/test-config.js';
import { HmacIpHasher } from './hmac-ip-hasher.js';

const OLD_KEY = new Uint8Array(32).fill(1);
const NEW_KEY = new Uint8Array(32).fill(2);
const IP = '203.0.113.7';

describe('HmacIpHasher', () => {
  const beforeRotation = new HmacIpHasher(
    createTestConfig({ ipHashKey: OLD_KEY, ipHashKeyVersion: 1 }),
  );
  const duringRotation = new HmacIpHasher(
    createTestConfig({
      ipHashKey: NEW_KEY,
      ipHashKeyVersion: 2,
      ipHashPreviousKey: OLD_KEY,
    }),
  );
  const afterRotation = new HmacIpHasher(
    createTestConfig({ ipHashKey: NEW_KEY, ipHashKeyVersion: 2 }),
  );

  it('hashes with the current key and never returns the address', () => {
    const stored = duringRotation.hash(IP);

    expect(stored.keyVersion).toBe(2);
    expect(stored.hash).toHaveLength(32);
    expect(Buffer.from(stored.hash).toString('latin1')).not.toContain(IP);
  });

  it('matches the same address and not another one', () => {
    const stored = beforeRotation.hash(IP);

    expect(beforeRotation.matches(IP, stored)).toBe(true);
    expect(beforeRotation.matches('203.0.113.8', stored)).toBe(false);
  });

  it('still matches hashes of the previous key during a rotation', () => {
    const stored = beforeRotation.hash(IP);

    expect(duringRotation.matches(IP, stored)).toBe(true);
    expect(duringRotation.isCurrent(stored)).toBe(false);
  });

  it('forgets hashes once the previous key is dropped', () => {
    expect(afterRotation.matches(IP, beforeRotation.hash(IP))).toBe(false);
  });

  it('gives different hashes under different keys', () => {
    expect(afterRotation.hash(IP).hash).not.toEqual(
      beforeRotation.hash(IP).hash,
    );
  });
});
