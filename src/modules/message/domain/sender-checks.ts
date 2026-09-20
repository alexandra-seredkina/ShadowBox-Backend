import { asciiHost, domainsIn, isSameSite } from './domain-names.js';
import type { MailSender } from './inbound-mail.js';

const SCRIPTS = [
  /\p{Script=Latin}/u,
  /\p{Script=Cyrillic}/u,
  /\p{Script=Greek}/u,
] as const;

/** Cyrillic and Greek lower-case letters that look like Latin ones in most fonts. */
const LATIN_LOOKALIKES = new Set('асԁеһіјӏорԛѕуԝхαικνορυχ');

/** "PayPal <paypal.com>" sent from evil.example: the name names a domain the mail is not from. */
export function isDisplayNameSpoof(from: MailSender): boolean {
  const own = asciiHost(from.domain);
  if (own === null) {
    return false;
  }
  return domainsIn(from.name).some((shown) => !isSameSite(shown, own));
}

/** A label mixing scripts (pаypal) or made only of letters that pass for Latin (аррӏе). */
export function isLookalikeDomain(domain: string): boolean {
  return domain
    .split('.')
    .some((label) => mixesScripts(label) || passesForLatin(label));
}

function mixesScripts(label: string): boolean {
  return SCRIPTS.filter((script) => script.test(label)).length > 1;
}

function passesForLatin(label: string): boolean {
  const letters = Array.from(label).filter((char) => /\p{L}/u.test(char));
  return (
    letters.length > 0 &&
    !SCRIPTS[0].test(label) &&
    letters.every((letter) => LATIN_LOOKALIKES.has(letter))
  );
}
