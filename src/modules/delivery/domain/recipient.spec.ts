import { parseRecipientAddress } from './recipient.js';

const DOMAIN = 'shadowbox.test';

describe('parseRecipientAddress', () => {
  it('accepts an issued address and lower-cases it', () => {
    expect(
      parseRecipientAddress(' K7F3MZ9Q2A@ShadowBox.Test ', DOMAIN),
    ).toEqual({ localPart: 'k7f3mz9q2a', domain: DOMAIN });
  });

  it.each([
    ['another domain', 'k7f3mz9q2a@example.com'],
    ['a subdomain', 'k7f3mz9q2a@mail.shadowbox.test'],
    ['no domain', 'k7f3mz9q2a'],
    ['an empty local part', '@shadowbox.test'],
    ['a short local part', 'kage@shadowbox.test'],
    ['a long local part', 'k7f3mz9q2ab@shadowbox.test'],
    ['a plus tag', 'k7f3mz9q2a+shop@shadowbox.test'],
    ['punctuation', 'k7f3m.z9q2@shadowbox.test'],
    ['non-ASCII letters', 'k7f3mz9q2а@shadowbox.test'],
    ['two at signs', 'k7f3mz9q2a@x@shadowbox.test'],
  ])('refuses %s', (_case, raw) => {
    expect(parseRecipientAddress(raw, DOMAIN)).toBeNull();
  });
});
