import { SodiumAuthKeyHasher } from './sodium-auth-key-hasher.js';

describe('SodiumAuthKeyHasher', () => {
  const hasher = new SodiumAuthKeyHasher();
  const authKey = new Uint8Array(32).fill(7);
  let hash: string;

  beforeAll(async () => {
    hash = await hasher.hash(authKey);
  });

  it('produces an encoded Argon2id hash with the required cost', () => {
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$[^\0]+$/);
  });

  it('verifies the same key', async () => {
    await expect(hasher.verify(hash, authKey)).resolves.toBe(true);
  });

  it('rejects another key', async () => {
    await expect(hasher.verify(hash, new Uint8Array(32).fill(8))).resolves.toBe(
      false,
    );
  });

  it('rejects a malformed hash instead of throwing', async () => {
    await expect(hasher.verify('x'.repeat(200), authKey)).resolves.toBe(false);
  });

  it('asks for a rehash only when the cost is below the current one', () => {
    expect(hasher.needsRehash(hash)).toBe(false);
    expect(hasher.needsRehash(hash.replace('m=65536,t=3', 'm=65536,t=2'))).toBe(
      true,
    );
  });
});
