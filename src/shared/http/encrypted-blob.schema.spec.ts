import { metadataBlobSchema } from './encrypted-blob.schema.js';

const encoded = (length: number): string =>
  Buffer.alloc(length, 1).toString('base64url');

const valid = {
  v: 1,
  alg: 'x25519-xchacha20poly1305',
  sealedKey: encoded(80),
  nonce: encoded(24),
  ciphertext: encoded(40),
};

describe('metadataBlobSchema', () => {
  it('accepts a well-formed metadata blob as is', () => {
    expect(metadataBlobSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['a short sealed key', { sealedKey: encoded(32) }],
    ['a short nonce', { nonce: encoded(12) }],
    ['an empty ciphertext', { ciphertext: encoded(16) }],
    ['an oversized ciphertext', { ciphertext: encoded(1041) }],
    ['another version', { v: 2 }],
    ['standard base64', { nonce: `${'+'.repeat(31)}A` }],
    ['an extra field', { label: 'shop' }],
  ])('rejects %s', (_, change) => {
    expect(metadataBlobSchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    );
  });
});
