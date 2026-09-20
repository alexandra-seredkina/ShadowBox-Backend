import type { DNSResolver } from 'mailauth';
import { createTestConfig } from '../../../../test/support/test-config.js';
import type { MailEnvelope } from '../domain/inbound-mail.js';
import { MailauthAuthenticator } from './mailauth-authenticator.js';

const SENDER_IP = '192.0.2.10';

/** example.com allows only SENDER_IP and asks receivers to reject the rest. */
const TXT_RECORDS: Readonly<Record<string, string>> = {
  'example.com': `v=spf1 ip4:${SENDER_IP} -all`,
  '_dmarc.example.com': 'v=DMARC1; p=reject',
};

const resolver: DNSResolver = (domain, rrtype) => {
  const record = TXT_RECORDS[domain.toLowerCase()];
  if (rrtype === 'TXT' && record !== undefined) {
    return Promise.resolve([[record]]);
  }
  return Promise.reject(
    Object.assign(new Error(`No ${rrtype} for ${domain}`), {
      code: 'ENOTFOUND',
    }),
  );
};

const MESSAGE = Buffer.from(
  [
    'From: news@example.com',
    'To: k7f3mz9q2a@shadowbox.test',
    'Subject: hi',
    'Message-ID: <1@example.com>',
    '',
    'hello',
    '',
  ].join('\r\n'),
);

function envelope(overrides: Partial<MailEnvelope> = {}): MailEnvelope {
  return {
    clientIp: SENDER_IP,
    helo: 'mail.example.com',
    mailFrom: 'news@example.com',
    ...overrides,
  };
}

describe('MailauthAuthenticator', () => {
  const authenticator = MailauthAuthenticator.usingResolver(
    createTestConfig(),
    resolver,
  );

  it('passes SPF and DMARC for an allowed server', async () => {
    await expect(authenticator.verify(MESSAGE, envelope())).resolves.toEqual({
      spf: 'pass',
      dkim: 'none',
      dmarc: 'pass',
    });
  });

  it('fails SPF and DMARC for a server the domain does not allow', async () => {
    await expect(
      authenticator.verify(MESSAGE, envelope({ clientIp: '198.51.100.7' })),
    ).resolves.toEqual({ spf: 'fail', dkim: 'none', dmarc: 'fail' });
  });

  it('reports none when the domain publishes nothing', async () => {
    const unknown = Buffer.from(
      MESSAGE.toString().replace('news@example.com', 'a@unknown.example'),
    );

    await expect(
      authenticator.verify(
        unknown,
        envelope({ mailFrom: 'a@unknown.example' }),
      ),
    ).resolves.toEqual({ spf: 'none', dkim: 'none', dmarc: 'none' });
  });

  it('checks a bounce by its HELO name', async () => {
    await expect(
      authenticator.verify(
        MESSAGE,
        envelope({ mailFrom: null, helo: 'example.com' }),
      ),
    ).resolves.toMatchObject({ spf: 'pass' });
  });
});
