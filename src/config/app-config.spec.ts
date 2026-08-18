import { ConfigValidationError, loadConfig } from './app-config.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:secret-pass@localhost:5432/db',
  PORT: '4000',
};

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const config = loadConfig(validEnv);

    expect(config.port).toBe(4000);
    expect(config.databaseUrl).toBe(validEnv.DATABASE_URL);
  });

  it('applies defaults for optional variables', () => {
    const config = loadConfig({ DATABASE_URL: validEnv.DATABASE_URL });

    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
  });

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(
      ConfigValidationError,
    );
  });

  it('rejects a missing database url', () => {
    expect(() => loadConfig({ PORT: '4000' })).toThrow(ConfigValidationError);
  });

  it('rejects a non-postgres database url', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'mysql://user:pass@localhost/db' }),
    ).toThrow(ConfigValidationError);
  });

  it.each(['0', '65536', '3.5', 'http'])('rejects port %s', (port) => {
    expect(() => loadConfig({ ...validEnv, PORT: port })).toThrow(
      ConfigValidationError,
    );
  });

  it('does not leak variable values into the error', () => {
    const leaky = { DATABASE_URL: 'mysql://user:secret-pass@host/db' };

    expect(() => loadConfig(leaky)).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('secret-pass'),
      }),
    );
  });
});
