import { parsedMail } from '../../../../test/support/message-fakes.js';
import { roundUpToKiB } from './message.js';
import { previewOf, SNIPPET_MAX_CHARS, snippetOf } from './preview.js';

describe('previewOf', () => {
  it('keeps sender name and address, not the parsed domain', () => {
    expect(previewOf(parsedMail()).from).toEqual({
      name: 'Shop',
      address: 'news@shop.example',
    });
  });

  it('counts only files to download as attachments', () => {
    const inline = {
      filename: 'logo.png',
      mimeType: 'image/png',
      isInline: true,
    };
    const file = {
      filename: 'bill.pdf',
      mimeType: 'application/pdf',
      isInline: false,
    };

    expect(
      previewOf(parsedMail({ attachments: [inline] })).hasAttachments,
    ).toBe(false);
    expect(
      previewOf(parsedMail({ attachments: [inline, file] })).hasAttachments,
    ).toBe(true);
  });
});

describe('snippetOf', () => {
  it('collapses whitespace', () => {
    expect(snippetOf('  Hello\r\n\r\n\tworld  ')).toBe('Hello world');
  });

  it(`stops at ${SNIPPET_MAX_CHARS} characters without splitting an emoji`, () => {
    const snippet = snippetOf('🙂'.repeat(300));

    expect(Array.from(snippet)).toHaveLength(SNIPPET_MAX_CHARS);
    expect(snippet).toBe('🙂'.repeat(SNIPPET_MAX_CHARS));
  });
});

describe('roundUpToKiB', () => {
  it.each([
    [0, 0],
    [1, 1024],
    [1024, 1024],
    [1025, 2048],
  ])('rounds %i bytes to %i', (bytes, rounded) => {
    expect(roundUpToKiB(bytes)).toBe(rounded);
  });
});
