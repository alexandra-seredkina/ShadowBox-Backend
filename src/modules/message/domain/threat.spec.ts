import {
  parsedMail,
  PASSED_AUTH,
} from '../../../../test/support/message-fakes.js';
import { assessThreat, ThreatSignals, verdictOf } from './threat.js';

function signals(overrides: Partial<ThreatSignals> = {}): ThreatSignals {
  const mail = parsedMail();
  return {
    auth: PASSED_AUTH,
    isKnownSender: true,
    from: mail.from,
    links: [],
    attachments: [],
    ...overrides,
  };
}

describe('verdictOf', () => {
  it('is safe without markers', () => {
    expect(verdictOf([])).toBe('safe');
  });

  it('is caution when the sender is only new', () => {
    expect(verdictOf(['UNKNOWN_SENDER'])).toBe('caution');
  });

  it('is danger as soon as a real warning is present', () => {
    expect(verdictOf(['UNKNOWN_SENDER', 'LINK_MISMATCH'])).toBe('danger');
  });
});

describe('assessThreat', () => {
  it('passes the authentication results through', () => {
    const auth = { spf: 'fail', dkim: 'pass', dmarc: 'none' } as const;

    expect(assessThreat(signals({ auth }))).toEqual({
      verdict: 'safe',
      markers: [],
      auth,
    });
  });

  it('flags failed DMARC but not a failed SPF alone', () => {
    expect(
      assessThreat(
        signals({ auth: { spf: 'fail', dkim: 'none', dmarc: 'pass' } }),
      ).markers,
    ).toEqual([]);
    expect(
      assessThreat(
        signals({ auth: { spf: 'pass', dkim: 'pass', dmarc: 'fail' } }),
      ).markers,
    ).toEqual(['AUTH_FAILED']);
  });

  it('reports every marker that applies, in contract order', () => {
    const threat = assessThreat(
      signals({
        isKnownSender: false,
        auth: { spf: 'fail', dkim: 'fail', dmarc: 'fail' },
        from: {
          name: 'paypal.com',
          address: 'service@pаypal.example',
          domain: 'pаypal.example',
        },
        links: [{ href: 'https://evil.example/login', text: 'paypal.com' }],
        attachments: [
          {
            filename: 'invoice.pdf.exe',
            mimeType: 'application/pdf',
            isInline: false,
          },
        ],
      }),
    );

    expect(threat).toMatchObject({
      verdict: 'danger',
      markers: [
        'UNKNOWN_SENDER',
        'AUTH_FAILED',
        'DISPLAY_NAME_SPOOF',
        'LOOKALIKE_DOMAIN',
        'LINK_MISMATCH',
        'DANGEROUS_ATTACHMENT',
      ],
    });
  });
});
