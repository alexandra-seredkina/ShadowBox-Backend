import { domainsIn, isSameSite, linkHost } from './domain-names.js';
import type { MailLink } from './inbound-mail.js';

/** The text shows one domain, the link goes to another: "paypal.com" pointing at evil.example. */
export function isMismatchedLink(link: MailLink): boolean {
  const target = linkHost(link.href);
  if (target === null) {
    return false;
  }
  return domainsIn(link.text).some((shown) => !isSameSite(shown, target));
}
