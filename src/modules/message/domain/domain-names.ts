/** Something that reads as a domain to a person: labels joined by dots, ending in letters. */
const DOMAIN_IN_TEXT =
  /(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+\p{L}{2,63}/gu;

/** Only so much of a display name or link text is worth scanning. */
const MAX_SCANNED_CHARS = 1000;

/** Lower-case ASCII (punycode) form of a host name, or null when it is not one. */
export function asciiHost(host: string): string | null {
  const url = `http://${host}/`;
  return URL.canParse(url) ? new URL(url).hostname : null;
}

/** Host of an http(s) link in ASCII form; null for mailto:, javascript: and the like. */
export function linkHost(href: string): string | null {
  if (!URL.canParse(href)) {
    return null;
  }
  const url = new URL(href);
  return url.protocol === 'http:' || url.protocol === 'https:'
    ? url.hostname
    : null;
}

/** Domains mentioned in free text, in ASCII form. */
export function domainsIn(text: string): string[] {
  const found = text.slice(0, MAX_SCANNED_CHARS).match(DOMAIN_IN_TEXT) ?? [];
  return found.map(asciiHost).filter((host): host is string => host !== null);
}

/** The same host, or one is a subdomain of the other (paypal.com and www.paypal.com). */
export function isSameSite(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}
