import request from 'supertest';
import { App } from 'supertest/types.js';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { solvePow } from './pow.js';
import { TEST_ALLOWED_ORIGIN } from './test-config.js';

/** supertest connects over loopback; trust it as the proxy to vary client IPs. */
export const LOOPBACK_PROXIES = ['127.0.0.1', '::ffff:127.0.0.1', '::1'];
export const TEST_AUTH_KEY = Buffer.alloc(32, 1).toString('base64url');

export function encoded(length: number, fill: number): string {
  return Buffer.alloc(length, fill).toString('base64url');
}

/** A metadata blob of valid sizes; the server never opens it. */
export function metadataBlob(fill = 3): Record<string, unknown> {
  return {
    v: 1,
    alg: 'x25519-xchacha20poly1305',
    sealedKey: encoded(80, 1),
    nonce: encoded(24, 2),
    ciphertext: encoded(40, fill),
  };
}

export interface TestUser {
  readonly cookie: string;
  readonly ip: string;
  readonly inboxId: string;
}

export function cookieOf(response: request.Response): string {
  const match = /^(__Host-sb_session=[^;]+)/.exec(
    String(response.headers['set-cookie'] ?? ''),
  );
  if (match?.[1] === undefined) {
    throw new Error('Response sets no session cookie');
  }
  return match[1];
}

export function callAs(
  server: App,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  user: TestUser | null,
): request.Test {
  const test = request(server)
    [method](`/api/v1/${path}`)
    .set('Origin', TEST_ALLOWED_ORIGIN)
    .set('X-Forwarded-For', user?.ip ?? '198.51.100.250');
  return user === null ? test : test.set('Cookie', user.cookie);
}

/** Signs up through the real API, so every test user is a complete account. */
export async function registerUser(params: {
  readonly server: App;
  readonly prisma: PrismaService;
  readonly login: string;
  readonly ip: string;
}): Promise<TestUser> {
  const { server, login, ip } = params;
  const challenge = await request(server)
    .post('/api/v1/auth/pow')
    .set('Origin', TEST_ALLOWED_ORIGIN)
    .set('X-Forwarded-For', ip)
    .send({ purpose: 'register' })
    .expect(200);
  const response = await request(server)
    .post('/api/v1/auth/register')
    .set('Origin', TEST_ALLOWED_ORIGIN)
    .set('X-Forwarded-For', ip)
    .send({
      login,
      authKey: TEST_AUTH_KEY,
      kdf: {
        algorithm: 'argon2id13',
        salt: encoded(16, 2),
        opsLimit: 3,
        memLimitBytes: 67108864,
      },
      keys: {
        publicKey: encoded(32, 3),
        encryptedPrivateKey: {
          nonce: encoded(24, 4),
          ciphertext: encoded(48, 5),
        },
        recoveryEncryptedPrivateKey: {
          nonce: encoded(24, 6),
          ciphertext: encoded(48, 7),
        },
      },
      pow: {
        challengeId: challenge.body.challengeId,
        nonce: solvePow(
          Buffer.from(challenge.body.prefix, 'base64url'),
          challenge.body.difficulty,
        ),
      },
    })
    .expect(201);
  const inbox = await params.prisma.folder.findFirstOrThrow({
    where: { account: { login }, systemRole: 'inbox' },
    select: { id: true },
  });
  return { cookie: cookieOf(response), ip, inboxId: inbox.id };
}
