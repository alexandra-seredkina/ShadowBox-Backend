import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AppConfig } from './../src/config/app-config.js';
import { PrismaService } from './../src/infrastructure/prisma/prisma.service.js';

const ALLOWED_ORIGIN = 'http://localhost:8080';

const testConfig = new AppConfig({
  port: 3000,
  databaseUrl: 'postgresql://test@localhost/test',
  logLevel: 'silent',
  allowedOrigins: [ALLOWED_ORIGIN],
});

@Controller('probe')
class ProbeController {
  @Get()
  read(): { ok: true } {
    return { ok: true };
  }

  @Post()
  echo(@Body() body: unknown): unknown {
    return body;
  }
}

@Module({ imports: [AppModule], controllers: [ProbeController] })
class TestAppModule {}

describe('App (e2e)', () => {
  const prisma = { $queryRaw: vi.fn() };
  let app: NestExpressApplication;
  let server: App;

  beforeEach(async () => {
    prisma.$queryRaw.mockReset().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    })
      .overrideProvider(AppConfig)
      .useValue(testConfig)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('health', () => {
    it('GET /api/health reports ok', () => {
      return request(server)
        .get('/api/health')
        .expect(200)
        .expect({ status: 'ok', db: 'up' });
    });

    it('GET /api/health returns 503 when the database is down', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));

      const response = await request(server).get('/api/health').expect(503);

      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('is not exposed under the versioned prefix', () => {
      return request(server).get('/api/v1/health').expect(404);
    });
  });

  describe('routing and errors', () => {
    it('serves business routes under /api/v1', () => {
      return request(server).get('/api/v1/probe').expect(200, { ok: true });
    });

    it('does not serve business routes without a version', () => {
      return request(server).get('/api/probe').expect(404);
    });

    it('answers an unknown route in the API error format', async () => {
      const response = await request(server)
        .get('/api/v1/does-not-exist?token=secret')
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
      const response = await request(server)
        .get('/api/health')
        .set('X-Request-Id', 'attacker-chosen-id');

      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('origin check', () => {
    it('accepts a mutating request from an allowed origin', () => {
      return request(server)
        .post('/api/v1/probe')
        .set('Origin', ALLOWED_ORIGIN)
        .send({ hello: 'world' })
        .expect(201, { hello: 'world' });
    });

    it.each([
      ['a foreign origin', 'https://evil.example'],
      ['a lookalike origin', 'http://localhost:8080.evil.example'],
      ['a null origin', 'null'],
    ])('rejects %s', async (_case, origin) => {
      const response = await request(server)
        .post('/api/v1/probe')
        .set('Origin', origin)
        .send({})
        .expect(403);

      expect(response.body.error.code).toBe('ORIGIN_MISMATCH');
    });

    it('rejects a mutating request without Origin', async () => {
      const response = await request(server)
        .post('/api/v1/probe')
        .send({})
        .expect(403);

      expect(response.body.error.code).toBe('ORIGIN_MISMATCH');
    });

    it('does not require Origin for reads', () => {
      return request(server).get('/api/v1/probe').expect(200);
    });
  });

  describe('request body', () => {
    it('rejects a body over 64 KiB', async () => {
      const response = await request(server)
        .post('/api/v1/probe')
        .set('Origin', ALLOWED_ORIGIN)
        .send({ padding: 'x'.repeat(64 * 1024) })
        .expect(413);

      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects malformed JSON in the API error format', async () => {
      const response = await request(server)
        .post('/api/v1/probe')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('{"broken":')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('does not parse form bodies', () => {
      return request(server)
        .post('/api/v1/probe')
        .set('Origin', ALLOWED_ORIGIN)
        .type('form')
        .send('a=1')
        .expect(201)
        .expect((response) => {
          expect(response.text).toBe('');
        });
    });
  });
});
