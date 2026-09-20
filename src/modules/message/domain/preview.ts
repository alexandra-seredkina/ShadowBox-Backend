import type { ParsedMail } from './inbound-mail.js';

export const SNIPPET_MAX_CHARS = 200;

/** Whitespace collapses, so this is plenty for a 200-character snippet. */
const SNIPPET_SOURCE_CHARS = 4096;

/** Shown in the message list; sealed for the owner like the body. */
export interface MessagePreview {
  readonly from: { readonly name: string; readonly address: string };
  readonly subject: string;
  readonly snippet: string;
  readonly hasAttachments: boolean;
}

export function previewOf(mail: ParsedMail): MessagePreview {
  return {
    from: { name: mail.from.name, address: mail.from.address },
    subject: mail.subject,
    snippet: snippetOf(mail.bodyText),
    hasAttachments: mail.attachments.some((attachment) => !attachment.isInline),
  };
}

/** Counted in code points, so an emoji is never cut in half. */
export function snippetOf(text: string): string {
  const collapsed = text
    .slice(0, SNIPPET_SOURCE_CHARS)
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(collapsed).slice(0, SNIPPET_MAX_CHARS).join('');
}
