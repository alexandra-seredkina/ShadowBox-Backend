import {
  KDF_MEM_LIMIT_BYTES,
  KDF_OPS_LIMIT,
  standardKdfParams,
} from './kdf-params.js';

describe('standardKdfParams', () => {
  it('pairs the salt with the fixed cost parameters', () => {
    const salt = new Uint8Array(16).fill(1);

    expect(standardKdfParams(salt)).toEqual({
      algorithm: 'argon2id13',
      salt,
      opsLimit: KDF_OPS_LIMIT,
      memLimitBytes: KDF_MEM_LIMIT_BYTES,
    });
  });

  it('rejects a salt of the wrong size', () => {
    expect(() => standardKdfParams(new Uint8Array(15))).toThrow(RangeError);
  });
});
