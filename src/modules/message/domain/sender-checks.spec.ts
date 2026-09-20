import type { MailSender } from './inbound-mail.js';
import { isDisplayNameSpoof, isLookalikeDomain } from './sender-checks.js';

function sender(name: string, address: string): MailSender {
  const domain = address.slice(address.lastIndexOf('@') + 1);
  return { name, address, domain };
}

describe('isDisplayNameSpoof', () => {
  it('flags a name that shows another domain', () => {
    expect(
      isDisplayNameSpoof(sender('PayPal (paypal.com)', 'x@evil.example')),
    ).toBe(true);
    expect(
      isDisplayNameSpoof(sender('support@bank.example', 'x@evil.example')),
    ).toBe(true);
  });

  it('accepts a name with the sender domain or its parent', () => {
    expect(
      isDisplayNameSpoof(sender('bank.example', 'news@mail.bank.example')),
    ).toBe(false);
    expect(
      isDisplayNameSpoof(sender('Bank <BANK.EXAMPLE>', 'news@bank.example')),
    ).toBe(false);
  });

  it('ignores names without a domain', () => {
    expect(isDisplayNameSpoof(sender('J.R.R. Tolkien', 'x@example.com'))).toBe(
      false,
    );
    expect(isDisplayNameSpoof(sender('Kage', 'x@example.com'))).toBe(false);
  });

  it('cannot judge a sender without a domain', () => {
    expect(
      isDisplayNameSpoof({ name: 'paypal.com', address: '', domain: '' }),
    ).toBe(false);
  });

  it('compares Unicode and punycode forms as the same domain', () => {
    expect(
      isDisplayNameSpoof(sender('почта.рф', 'info@xn--80a1acny.xn--p1ai')),
    ).toBe(false);
  });
});

describe('isLookalikeDomain', () => {
  it('flags a label that mixes Latin and Cyrillic', () => {
    expect(isLookalikeDomain('pаypal.com')).toBe(true);
  });

  it('flags a label made only of letters that pass for Latin', () => {
    expect(isLookalikeDomain('аррӏе.com')).toBe(true);
  });

  it('accepts plain Latin and plain Cyrillic domains', () => {
    expect(isLookalikeDomain('paypal.com')).toBe(false);
    expect(isLookalikeDomain('яндекс.рф')).toBe(false);
    expect(isLookalikeDomain('')).toBe(false);
  });

  it('flags Greek letters inside a Latin label', () => {
    expect(isLookalikeDomain('gοogle.com')).toBe(true);
  });
});
