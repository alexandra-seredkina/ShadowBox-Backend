import { domainToUnicode } from 'node:url';
import { Injectable } from '@nestjs/common';
import PostalMime, { type Address, type Attachment } from 'postal-mime';
import type {
  MailAttachment,
  MailLink,
  MailSender,
  ParsedMail,
} from '../domain/inbound-mail.js';
import { MailParser } from '../domain/mail-parser.js';

/** Bounded so that a huge body full of unclosed tags cannot make the scan quadratic. */
const ANCHOR =
  /<a\b[^>]{0,2000}?\bhref\s*=\s*(?:"([^"]{0,2000})"|'([^']{0,2000})'|([^\s>]{1,2000}))[^>]{0,2000}>([\s\S]{0,2000}?)<\/a\s*>/giu;
const HIDDEN_ELEMENT = /<(script|style|head)\b[\s\S]*?<\/\1\s*>/giu;
const TAG = /<[^>]*>/gu;
const MAX_LINKS = 500;

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(html: string): string {
  return html.replace(
    /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/giu,
    (entity: string, name: string) => {
      const lower = name.toLowerCase();
      if (lower.startsWith('#x')) {
        return codePoint(Number.parseInt(lower.slice(2), 16)) ?? entity;
      }
      if (lower.startsWith('#')) {
        return codePoint(Number.parseInt(lower.slice(1), 10)) ?? entity;
      }
      return ENTITIES[lower] ?? entity;
    },
  );
}

function codePoint(value: number): string | null {
  return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : null;
}

function htmlToText(html: string): string {
  return decodeEntities(html.replace(HIDDEN_ELEMENT, ' ').replace(TAG, ' '));
}

function linksIn(html: string): MailLink[] {
  return Array.from(html.matchAll(ANCHOR), (match) => ({
    href: decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim(),
    text: htmlToText(match[4] ?? ''),
  })).slice(0, MAX_LINKS);
}

function senderOf(from: Address | undefined): MailSender {
  const mailbox = from?.group === undefined ? from : from.group[0];
  const address = mailbox?.address ?? '';
  const at = address.lastIndexOf('@');
  return {
    name: mailbox?.name ?? '',
    address,
    domain: at < 0 ? '' : domainToUnicode(address.slice(at + 1).toLowerCase()),
  };
}

function attachmentOf(attachment: Attachment): MailAttachment {
  return {
    filename: attachment.filename ?? '',
    mimeType: attachment.mimeType,
    isInline:
      attachment.disposition === 'inline' || attachment.related === true,
  };
}

@Injectable()
export class PostalMimeParser implements MailParser {
  async parse(raw: Uint8Array): Promise<ParsedMail> {
    const email = await PostalMime.parse(raw, {
      attachmentEncoding: 'arraybuffer',
    });
    const html = email.html ?? '';
    return {
      from: senderOf(email.from),
      subject: email.subject ?? '',
      bodyText: email.text ?? htmlToText(html),
      links: linksIn(html),
      attachments: email.attachments.map(attachmentOf),
    };
  }
}
