import { describeDevice } from './device.js';

describe('describeDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      'Firefox · Linux',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0',
      'Edge · Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
      'Safari · macOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
      'Safari · iOS',
    ],
  ])('describes %j as %j', (userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  it('falls back to Other for unknown or missing agents', () => {
    expect(describeDevice('curl/8.9')).toBe('Other · Other');
    expect(describeDevice(undefined)).toBe('Other · Other');
  });

  it('never returns more than the coarse description', () => {
    expect(describeDevice('x'.repeat(10_000)).length).toBeLessThan(64);
  });
});
