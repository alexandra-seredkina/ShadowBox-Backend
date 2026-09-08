import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AppConfigValues } from '../src/config/app-config.js';
import { PowChallengeRepository } from '../src/modules/identity/domain/pow-challenge.repository.js';
import { createTestApp } from './support/create-test-app.js';
import { InMemoryPowChallengeRepository } from './support/identity-fakes.js';
import { TEST_ALLOWED_ORIGIN } from './support/test-config.js';

/** supertest connects over loopback, so this is the socket address of the "proxy". */
const LOOPBACK = ['127.0.0.1', '::ffff:127.0.0.1', '::1'];

describe('Rate limits (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;

  async function start(config: Partial<AppConfigValues> = {}): Promise<void> {
    app = await createTestApp({
      rootModule: AppModule,
      config,
      prisma: { $queryRaw: () => Promise.resolve([{ '?column?': 1 }]) },
      overrides: [
        {
          provide: PowChallengeRepository,
          useValue: new InMemoryPowChallengeRepository(),
        },
      ],
    });
    server = app.getHttpServer();
  }

  function pow(forwardedFor?: string): request.Test {
    const test = request(server)
      .post('/api/v1/auth/pow')
      .set('Origin', TEST_ALLOWED_ORIGIN);
    if (forwardedFor !== undefined) {
      test.set('X-Forwarded-For', forwardedFor);
    }
    return test.send({ purpose: 'register' });
  }

  afterEach(async () => {
    await app.close();
  });

  it('answers 429 with Retry-After once the budget is spent', async () => {
    await start();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await pow().expect(200);
    }

    const response = await pow().expect(429);

    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(60);
  });

  it('keeps separate budgets per endpoint', async () => {
    await start();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await pow().expect(200);
    }

    await request(server)
      .post('/api/v1/auth/prelogin')
      .set('Origin', TEST_ALLOWED_ORIGIN)
      .send({ login: 'kage' })
      .expect((response) => {
        expect(response.status).not.toBe(429);
      });
  });

  it('ignores X-Forwarded-For from an untrusted peer', async () => {
    await start();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await pow(`198.51.100.${attempt}`).expect(200);
    }

    await pow('198.51.100.99').expect(429);
  });

  it('counts each client behind the trusted proxy on its own', async () => {
    await start({ trustedProxies: LOOPBACK });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await pow('198.51.100.1').expect(200);
    }

    await pow('198.51.100.1').expect(429);
    await pow('198.51.100.2').expect(200);
  });

  it('takes the address nginx appended, not one the client forged', async () => {
    await start({ trustedProxies: LOOPBACK });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await pow(`10.0.0.${attempt}, 198.51.100.1`).expect(200);
    }

    await pow('10.0.0.99, 198.51.100.1').expect(429);
  });

  it('never limits the health check', async () => {
    await start();
    for (let attempt = 0; attempt < 310; attempt += 1) {
      await request(server).get('/api/health').expect(200);
    }
  });
});
