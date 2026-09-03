import { base64UrlBytes } from './base64url.schema.js';

describe('base64UrlBytes', () => {
  const schema = base64UrlBytes(16);

  it('decodes a value of the right size', () => {
    const encoded = Buffer.alloc(16, 0xfb).toString('base64url');

    expect(schema.parse(encoded)).toEqual(Buffer.alloc(16, 0xfb));
  });

  it.each([
    ['too short', 'AAAA'],
    ['padded', `${Buffer.alloc(16).toString('base64')}`],
    ['standard alphabet', `${'+'.repeat(21)}A`],
  ])('rejects a %s value', (_, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
