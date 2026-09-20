import { PostalMimeParser } from './postal-mime-parser.js';

function mime(lines: readonly string[]): Uint8Array {
  return Buffer.from(lines.join('\r\n'));
}

describe('PostalMimeParser', () => {
  const parser = new PostalMimeParser();

  it('reads sender, subject and plain text', async () => {
    const parsed = await parser.parse(
      mime([
        'From: "Shop" <News@Shop.Example>',
        'Subject: =?UTF-8?B?0JfQsNC60LDQtw==?=',
        '',
        'Thanks for your order.',
      ]),
    );

    expect(parsed).toEqual({
      from: {
        name: 'Shop',
        address: 'News@Shop.Example',
        domain: 'shop.example',
      },
      subject: 'Заказ',
      bodyText: 'Thanks for your order.\n',
      links: [],
      attachments: [],
    });
  });

  it('gives the sender domain in Unicode', async () => {
    const parsed = await parser.parse(
      mime(['From: info@xn--80a1acny.xn--p1ai', '', 'hi']),
    );

    expect(parsed.from.domain).toBe('почта.рф');
  });

  it('turns an HTML-only body into text and collects its links', async () => {
    const parsed = await parser.parse(
      mime([
        'From: a@example.com',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<html><head><style>p{}</style></head><body>',
        '<p>Tom &amp; Jerry</p>',
        '<a class="x" href="https://evil.example/?a=1&amp;b=2"><b>paypal.com</b></a>',
        "<a href='mailto:x@example.com'>write</a>",
        '</body></html>',
      ]),
    );

    expect(parsed.bodyText.replace(/\s+/g, ' ').trim()).toBe(
      'Tom & Jerry paypal.com write',
    );
    expect(parsed.links).toEqual([
      { href: 'https://evil.example/?a=1&b=2', text: ' paypal.com ' },
      { href: 'mailto:x@example.com', text: 'write' },
    ]);
  });

  it('lists attachments and tells inline pictures apart', async () => {
    const parsed = await parser.parse(
      mime([
        'From: a@example.com',
        'Content-Type: multipart/mixed; boundary="b"',
        '',
        '--b',
        'Content-Type: text/plain',
        '',
        'see attached',
        '--b',
        'Content-Type: application/x-msdownload',
        'Content-Disposition: attachment; filename="setup.exe"',
        'Content-Transfer-Encoding: base64',
        '',
        'TVo=',
        '--b',
        'Content-Type: image/png',
        'Content-Disposition: inline; filename="logo.png"',
        'Content-ID: <logo>',
        'Content-Transfer-Encoding: base64',
        '',
        'iVBORw0K',
        '--b--',
      ]),
    );

    expect(parsed.attachments).toEqual([
      {
        filename: 'setup.exe',
        mimeType: 'application/x-msdownload',
        isInline: false,
      },
      { filename: 'logo.png', mimeType: 'image/png', isInline: true },
    ]);
  });

  it('copes with a message without headers it needs', async () => {
    const parsed = await parser.parse(mime(['', 'just a body']));

    expect(parsed.from).toEqual({ name: '', address: '', domain: '' });
    expect(parsed.subject).toBe('');
  });
});
