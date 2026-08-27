import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AccountKdfRepository } from '../src/modules/identity/domain/account-kdf.repository.js';
import { standardKdfParams } from '../src/modules/identity/domain/kdf-params.js';
import { PowChallengeRepository } from '../src/modules/identity/domain/pow-challenge.repository.js';
import { createTestApp } from './support/create-test-app.js';
import {
  InMemoryAccountKdfRepository,
  InMemoryPowChallengeRepository,
} from './support/identity-fakes.js';
import { TEST_ALLOWED_ORIGIN } from './support/test-config.js';

const BASE64URL_16_BYTES = /^[A-Za-z0-9_-]{22}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const API_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let challenges: InMemoryPowChallengeRepository;
  let accounts: InMemoryAccountKdfRepository;

  function post(path: string, body: unknown): request.Test {
    return request(server)
      .post(`/api/v1/auth/${path}`)
      .set('Origin', TEST_ALLOWED_ORIGIN)
      .send(body as object);
  }

  beforeEach(async () => {
    challenges = new InMemoryPowChallengeRepository();
    accounts = new InMemoryAccountKdfRepository();
    accounts.add('kage', standardKdfParams(new Uint8Array(16).fill(9)));
    app = await createTestApp({
      rootModule: AppModule,
      overrides: [
        { provide: PowChallengeRepository, useValue: challenges },
        { provide: AccountKdfRepository, useValue: accounts },
      ],
    });
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/pow', () => {
    it('issues a challenge in the contract format', async () => {
      const response = await post('pow', { purpose: 'register' }).expect(200);

      expect(response.body).toEqual({
        challengeId: expect.stringMatching(UUID),
        prefix: expect.stringMatching(BASE64URL_16_BYTES),
        difficulty: 8,
        expiresAt: expect.stringMatching(API_INSTANT),
      });
      expect(challenges.saved.size).toBe(1);
    });

    it('issues a different prefix every time', async () => {
      const first = await post('pow', { purpose: 'login' }).expect(200);
      const second = await post('pow', { purpose: 'login' }).expect(200);

      expect(second.body.prefix).not.toBe(first.body.prefix);
    });

    it.each([
      [{}, [{ path: 'purpose', issue: 'required' }]],
      [{ purpose: 'send' }, [{ path: 'purpose', issue: 'invalid_value' }]],
      [
        { purpose: 'login', difficulty: 1 },
        [{ path: 'difficulty', issue: 'unknown_field' }],
      ],
    ])('rejects %j', async (body, details) => {
      const response = await post('pow', body).expect(400);

      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details,
      });
    });

    it('requires an allowed Origin', async () => {
      const response = await request(server)
        .post('/api/v1/auth/pow')
        .send({ purpose: 'register' })
        .expect(403);

      expect(response.body.error.code).toBe('ORIGIN_MISMATCH');
    });
  });

  describe('POST /api/v1/auth/prelogin', () => {
    it('returns the stored parameters of an existing login', async () => {
      const response = await post('prelogin', { login: 'Kage' }).expect(200);

      expect(response.body).toEqual({
        kdf: {
          algorithm: 'argon2id13',
          salt: Buffer.alloc(16, 9).toString('base64url'),
          opsLimit: 3,
          memLimitBytes: 67108864,
        },
      });
    });

    it('answers an unknown login exactly like a real one', async () => {
      const real = await post('prelogin', { login: 'kage' }).expect(200);
      const unknown = await post('prelogin', { login: 'nobody' }).expect(200);

      expect(Object.keys(unknown.body.kdf)).toEqual(Object.keys(real.body.kdf));
      expect(unknown.body.kdf).toMatchObject({
        algorithm: real.body.kdf.algorithm,
        opsLimit: real.body.kdf.opsLimit,
        memLimitBytes: real.body.kdf.memLimitBytes,
        salt: expect.stringMatching(BASE64URL_16_BYTES),
      });
    });

    it('keeps the decoy salt stable across calls', async () => {
      const first = await post('prelogin', { login: 'nobody' }).expect(200);
      const second = await post('prelogin', { login: 'NOBODY' }).expect(200);

      expect(second.body.kdf.salt).toBe(first.body.kdf.salt);
    });

    it.each([
      [{ login: 'ab' }, [{ path: 'login', issue: 'too_short' }]],
      [{ login: '.kage' }, [{ path: 'login', issue: 'invalid_format' }]],
      [{ login: 'x'.repeat(129) }, [{ path: 'login', issue: 'too_long' }]],
      [{}, [{ path: 'login', issue: 'required' }]],
    ])('rejects %j', async (body, details) => {
      const response = await post('prelogin', body).expect(400);

      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details,
      });
    });
  });
});
