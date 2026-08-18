import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AppConfig } from './../src/config/app-config.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const testConfig = new AppConfig({
  port: 3000,
  databaseUrl: 'postgresql://test@localhost/test',
  logLevel: 'silent',
});

describe('App (e2e)', () => {
  const prisma = { $queryRaw: vi.fn() };
  let app: INestApplication<App>;

  beforeEach(async () => {
    prisma.$queryRaw.mockReset().mockResolvedValue([]);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AppConfig)
      .useValue(testConfig)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/health reports ok', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', db: 'up' });
  });

  it('GET /api/health returns 503 when the database is down', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));

    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(503);

    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('answers an unknown route in the API error format', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/does-not-exist?token=secret')
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Not found',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('ignores a client supplied request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('X-Request-Id', 'attacker-chosen-id');

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
