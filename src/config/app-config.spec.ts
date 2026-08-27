import { ConfigValidationError, loadConfig } from './app-config.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:secret-pass@localhost:5432/db',
  PORT: '4000',
  ALLOWED_ORIGINS: 'http://localhost:8080, http://127.0.0.1:8080/',
  PRELOGIN_SALT_KEY: Buffer.alloc(32, 7).toString('base64url'),
};

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const config = loadConfig(validEnv);

    expect(config.port).toBe(4000);
    expect(config.databaseUrl).toBe(validEnv.DATABASE_URL);
  });

  it('applies defaults for optional variables', () => {
    const { PORT: _omitted, ...withoutPort } = validEnv;
    const config = loadConfig(withoutPort);

    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.powDifficulty).toBe(20);
  });

  it('normalizes allowed origins', () => {
    const config = loadConfig(validEnv);

    expect(config.allowedOrigins).toEqual([
      'http://localhost:8080',
      'http://127.0.0.1:8080',
    ]);
  });

  it.each(['', 'localhost:8080', 'ftp://localhost'])(
    'rejects allowed origins %j',
    (origins) => {
      expect(() =>
        loadConfig({ ...validEnv, ALLOWED_ORIGINS: origins }),
      ).toThrow(ConfigValidationError);
    },
  );

  it('decodes the prelogin salt key', () => {
    const config = loadConfig(validEnv);

    expect(Buffer.from(config.preloginSaltKey)).toEqual(Buffer.alloc(32, 7));
  });

  it.each([
    ['too short', Buffer.alloc(16).toString('base64url')],
    ['not base64url', 'not a key!'],
    ['empty', ''],
  ])('rejects a prelogin salt key that is %s', (_case, key) => {
    expect(() => loadConfig({ ...validEnv, PRELOGIN_SALT_KEY: key })).toThrow(
      ConfigValidationError,
    );
  });

  it('does not leak the prelogin salt key into the error', () => {
    const weakKey = Buffer.from('short-secret-key').toString('base64url');

    expect(() =>
      loadConfig({ ...validEnv, PRELOGIN_SALT_KEY: weakKey }),
    ).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(weakKey),
      }),
    );
  });

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(
      ConfigValidationError,
    );
  });

  it('rejects a missing database url', () => {
    const { DATABASE_URL: _omitted, ...withoutUrl } = validEnv;

    expect(() => loadConfig(withoutUrl)).toThrow(ConfigValidationError);
  });

  it('rejects a non-postgres database url', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        DATABASE_URL: 'mysql://user:pass@localhost/db',
      }),
    ).toThrow(ConfigValidationError);
  });

  it.each(['0', '65536', '3.5', 'http'])('rejects port %s', (port) => {
    expect(() => loadConfig({ ...validEnv, PORT: port })).toThrow(
      ConfigValidationError,
    );
  });

  it('does not leak variable values into the error', () => {
    const leaky = {
      ...validEnv,
      DATABASE_URL: 'mysql://user:secret-pass@host/db',
    };

    expect(() => loadConfig(leaky)).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('secret-pass'),
      }),
    );
  });
});
