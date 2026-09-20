import { isMismatchedLink } from './link-checks.js';

describe('isMismatchedLink', () => {
  it('flags text that shows one domain while the link goes to another', () => {
    expect(
      isMismatchedLink({
        href: 'https://evil.example/login',
        text: 'https://www.paypal.com/signin',
      }),
    ).toBe(true);
  });

  it('accepts a link to the shown domain or its subdomain', () => {
    expect(
      isMismatchedLink({
        href: 'https://www.paypal.com/x',
        text: 'paypal.com',
      }),
    ).toBe(false);
  });

  it('accepts ordinary link text', () => {
    expect(
      isMismatchedLink({ href: 'https://evil.example', text: 'Click here' }),
    ).toBe(false);
  });

  it('ignores links that are not web addresses', () => {
    expect(
      isMismatchedLink({
        href: 'mailto:help@evil.example',
        text: 'paypal.com',
      }),
    ).toBe(false);
    expect(isMismatchedLink({ href: 'not a url', text: 'paypal.com' })).toBe(
      false,
    );
  });
});
