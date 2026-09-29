import { readFile } from 'node:fs/promises';
import { previewOf } from '../src/modules/message/domain/preview.js';
import { assessThreat } from '../src/modules/message/domain/threat.js';
import { PostalMimeParser } from '../src/modules/message/infrastructure/postal-mime-parser.js';
import { PASSED_AUTH } from './support/message-fakes.js';

const FIXTURES = new URL('./fixtures/mail/', import.meta.url);

/** What the server makes of each fixture from a sender it already knows. */
async function assess(name: string) {
  const raw = await readFile(new URL(name, FIXTURES));
  const parsed = await new PostalMimeParser().parse(raw);
  return {
    preview: previewOf(parsed),
    threat: assessThreat({
      auth: PASSED_AUTH,
      isKnownSender: true,
      from: parsed.from,
      links: parsed.links,
      attachments: parsed.attachments,
    }),
  };
}

describe('mail fixtures', () => {
  it.each([
    ['normal.eml', 'safe', []],
    ['tracking-pixel.eml', 'safe', []],
    ['display-name-phish.eml', 'danger', ['DISPLAY_NAME_SPOOF']],
    ['lookalike-domain.eml', 'danger', ['LOOKALIKE_DOMAIN']],
    ['link-bait.eml', 'danger', ['LINK_MISMATCH']],
    ['exe-attachment.eml', 'danger', ['DANGEROUS_ATTACHMENT']],
  ])('%s is %s with %j', async (name, verdict, markers) => {
    const { threat } = await assess(name);

    expect(threat).toMatchObject({ verdict, markers });
  });

  it('gives the normal message a readable preview', async () => {
    const { preview } = await assess('normal.eml');

    expect(preview).toEqual({
      from: { name: 'Corner Shop', address: 'news@shop.example' },
      subject: 'Your order has shipped',
      snippet:
        'Hi, your order 1042 left our warehouse today and should arrive within three days. Corner Shop',
      hasAttachments: false,
    });
  });
});
