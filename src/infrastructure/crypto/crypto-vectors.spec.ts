import { hkdfSync } from 'node:crypto';
import sodium from 'sodium-native';
import { openEncryptedBlob } from '../../../test/support/open-encrypted-blob.js';
import { standardKdfParams } from '../../modules/identity/domain/kdf-params.js';
import {
  isPowSolution,
  PowChallenge,
  PowChallengeId,
} from '../../modules/identity/domain/pow-challenge.js';
import { sealEncryptedBlob } from './encrypted-blob.js';

/**
 * Fixed values shared with the web client: the same inputs must give the
 * same bytes on both sides. Published in the API contract under "Test vectors";
 * change both places together.
 */
const decode = (value: string): Buffer => Buffer.from(value, 'base64url');

const POW = {
  prefix: 'AAECAwQFBgcICQoLDA0ODw',
  difficulty: 20,
  validNonce: '1227078',
  invalidNonce: '1227077',
};

const KDF = {
  password: 'Ｋage-пароль-2026',
  normalizedPassword: 'Kage-пароль-2026',
  salt: 'EBESExQVFhcYGRobHB0eHw',
  opsLimit: 3,
  memLimitBytes: 67108864,
  master: '0l6X9EiRINXEeRSnVNRBKCnrkqez3ItXUsgxmJrpjVI',
  authKey: '0V2yYh-cMoaKSGVEOyknpWbtBVfG1LQmG91VrXV7KUM',
  encKey: 'GUbmeoA1Xq7cJPpXbBapSF4Um4wYxQX9S8uHUOqfmAA',
};

const KEY_PAIR = {
  seed: 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI',
  publicKey: 'zE8s22ld12bzQRjrZ7mGUv7R2LxJwzCxGbv6imSYk3g',
  secretKey: 'ledZX8ieUv393OnGpD102_YEcCXuBGLS0XLotqKEHa4',
};

const ENCRYPTED_PRIVATE_KEY = {
  nonce: 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3',
  ciphertext:
    'nC0PG_IpAmnKHCWI9sq8LbIdt9KRas1w1ZKI5vvwAjBoFeRAgiz-22t941m9pTM8',
};

const RECOVERY = {
  entropy: 'gIGCg4SFhoeIiYqLjI2Oj5CRkpOUlZaXmJmam5ydnp8',
  key: 'dtUvviCN03mNnTAHSh9nQhyX-f589qtXgKTICB4DcPk',
  nonce: 'QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZX',
  ciphertext:
    'tfwZRPGqejcBlqW2wuXATtv5wcY2FCouJLPtVqk0xlcbRDYDG9cfDqyWW1IlqPBK',
};

const BLOB = {
  plaintext: '{"label":"Магазины"}',
  contentKey: 'YGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn8',
  blob: {
    v: 1,
    alg: 'x25519-xchacha20poly1305',
    sealedKey:
      'B2yvsSUTSrvY75JLGl2eQHbTevCM7a_w10t_I5DeUENMXPA0pZ-3Aa3H35BvUjs0uMVNlNvNIjwIXiww2VQMYVMi2n4-c8CKT9DT7b8xtAE',
    nonce: 'oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3',
    ciphertext: 'BosPwyfhiZKa-FF2p4EvxpxqYEh14fTvibB1BIJmnJD0Uj4GVfz3txltOvc',
  },
} as const;

function hkdf32(key: Uint8Array, info: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', key, Buffer.alloc(0), Buffer.from(info, 'utf8'), 32),
  );
}

function aeadEncrypt(
  message: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array,
): Buffer {
  const ciphertext = Buffer.alloc(
    message.length + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES,
  );
  sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    ciphertext,
    message,
    null,
    null,
    nonce,
    key,
  );
  return ciphertext;
}

const keyPair = {
  publicKey: decode(KEY_PAIR.publicKey),
  secretKey: decode(KEY_PAIR.secretKey),
};

describe('test vectors', () => {
  describe('proof-of-work', () => {
    const now = new Date('2020-01-15T12:00:00Z');
    const challenge: PowChallenge = {
      id: '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0d' as PowChallengeId,
      purpose: 'register',
      prefix: decode(POW.prefix),
      difficulty: POW.difficulty,
      expiresAt: new Date(now.getTime() + 60_000),
    };

    it('accepts the valid nonce', () => {
      expect(
        isPowSolution(challenge, {
          purpose: 'register',
          nonce: POW.validNonce,
          now,
        }),
      ).toBe(true);
    });

    it('rejects the invalid nonce', () => {
      expect(
        isPowSolution(challenge, {
          purpose: 'register',
          nonce: POW.invalidNonce,
          now,
        }),
      ).toBe(false);
    });
  });

  describe('key derivation', () => {
    it('uses the only cost parameters registration accepts', () => {
      expect(standardKdfParams(decode(KDF.salt))).toEqual({
        algorithm: 'argon2id13',
        salt: decode(KDF.salt),
        opsLimit: KDF.opsLimit,
        memLimitBytes: KDF.memLimitBytes,
      });
    });

    it('derives master, authKey and encKey from the password', () => {
      const password = Buffer.from(KDF.password.normalize('NFKC'), 'utf8');
      const master = Buffer.alloc(32);
      sodium.crypto_pwhash(
        master,
        password,
        decode(KDF.salt),
        KDF.opsLimit,
        KDF.memLimitBytes,
        sodium.crypto_pwhash_ALG_ARGON2ID13,
      );

      expect(KDF.password.normalize('NFKC')).toBe(KDF.normalizedPassword);
      expect(master.toString('base64url')).toBe(KDF.master);
      expect(hkdf32(master, 'shadowbox/auth/v1').toString('base64url')).toBe(
        KDF.authKey,
      );
      expect(hkdf32(master, 'shadowbox/enc/v1').toString('base64url')).toBe(
        KDF.encKey,
      );
    });
  });

  describe('private key', () => {
    it('derives the key pair from the seed', () => {
      const publicKey = Buffer.alloc(32);
      const secretKey = Buffer.alloc(32);
      sodium.crypto_box_seed_keypair(
        publicKey,
        secretKey,
        decode(KEY_PAIR.seed),
      );

      expect(publicKey.toString('base64url')).toBe(KEY_PAIR.publicKey);
      expect(secretKey.toString('base64url')).toBe(KEY_PAIR.secretKey);
    });

    it('encrypts the private key with encKey', () => {
      const ciphertext = aeadEncrypt(
        keyPair.secretKey,
        decode(ENCRYPTED_PRIVATE_KEY.nonce),
        decode(KDF.encKey),
      );

      expect(ciphertext.toString('base64url')).toBe(
        ENCRYPTED_PRIVATE_KEY.ciphertext,
      );
    });

    it('encrypts the private key with the recovery key', () => {
      const recoveryKey = hkdf32(
        decode(RECOVERY.entropy),
        'shadowbox/recovery/v1',
      );

      expect(recoveryKey.toString('base64url')).toBe(RECOVERY.key);
      expect(
        aeadEncrypt(
          keyPair.secretKey,
          decode(RECOVERY.nonce),
          recoveryKey,
        ).toString('base64url'),
      ).toBe(RECOVERY.ciphertext);
    });
  });

  describe('EncryptedBlob v1', () => {
    const blob = {
      ...BLOB.blob,
      sealedKey: decode(BLOB.blob.sealedKey),
      nonce: decode(BLOB.blob.nonce),
      ciphertext: decode(BLOB.blob.ciphertext),
    };

    it('opens the published blob with the key pair', () => {
      const plaintext = openEncryptedBlob(blob, keyPair);

      expect(Buffer.from(plaintext).toString('utf8')).toBe(BLOB.plaintext);
    });

    it('gives the published ciphertext for the content key and nonce', () => {
      const ciphertext = aeadEncrypt(
        Buffer.from(BLOB.plaintext, 'utf8'),
        blob.nonce,
        decode(BLOB.contentKey),
      );

      expect(ciphertext.toString('base64url')).toBe(BLOB.blob.ciphertext);
    });

    it('produces blobs the owner can open', () => {
      const sealed = sealEncryptedBlob({
        publicKey: keyPair.publicKey,
        plaintext: Buffer.from(BLOB.plaintext, 'utf8'),
        random: {
          bytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
        },
      });

      expect(sealed).toMatchObject({ v: 1, alg: 'x25519-xchacha20poly1305' });
      expect(sealed.sealedKey).toHaveLength(80);
      expect(sealed.nonce).toHaveLength(24);
      expect(
        Buffer.from(openEncryptedBlob(sealed, keyPair)).toString('utf8'),
      ).toBe(BLOB.plaintext);
    });

    it('fails to open with another key pair', () => {
      const other = {
        publicKey: Buffer.alloc(32),
        secretKey: Buffer.alloc(32),
      };
      sodium.crypto_box_seed_keypair(
        other.publicKey,
        other.secretKey,
        Buffer.alloc(32, 1),
      );

      expect(() => openEncryptedBlob(blob, other)).toThrow();
    });
  });
});
