import { Writable } from 'node:stream';
import { pino } from 'pino';
import { REDACT_PATHS } from './redact-paths.js';

function captureLine(payload: object): string {
  let output = '';
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done): void {
      output += chunk.toString();
      done();
    },
  });
  pino(
    { redact: { paths: [...REDACT_PATHS], censor: '[redacted]' } },
    sink,
  ).info(payload);
  return output;
}

describe('REDACT_PATHS', () => {
  it('censors secrets at the top level and one level deep', () => {
    const line = captureLine({
      authKey: 'top-level-auth-key',
      body: { password: 'nested-password', login: 'kage' },
    });

    expect(line).not.toContain('top-level-auth-key');
    expect(line).not.toContain('nested-password');
    expect(line).toContain('kage');
  });

  it('censors cookie and authorization headers', () => {
    const line = captureLine({
      req: { headers: { cookie: 'sb_session=abc', authorization: 'Bearer x' } },
    });

    expect(line).not.toContain('sb_session=abc');
    expect(line).not.toContain('Bearer x');
  });
});
