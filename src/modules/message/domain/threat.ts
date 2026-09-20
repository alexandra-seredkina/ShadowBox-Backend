import { isDangerousAttachment } from './attachment-checks.js';
import type { MailAttachment, MailLink, MailSender } from './inbound-mail.js';
import { isMismatchedLink } from './link-checks.js';
import { isDisplayNameSpoof, isLookalikeDomain } from './sender-checks.js';

export const AUTH_RESULTS = ['pass', 'fail', 'none'] as const;
export type AuthResult = (typeof AUTH_RESULTS)[number];

export interface AuthResults {
  readonly spf: AuthResult;
  readonly dkim: AuthResult;
  readonly dmarc: AuthResult;
}

/** In the order they are reported. */
export const THREAT_MARKERS = [
  'UNKNOWN_SENDER',
  'AUTH_FAILED',
  'DISPLAY_NAME_SPOOF',
  'LOOKALIKE_DOMAIN',
  'LINK_MISMATCH',
  'DANGEROUS_ATTACHMENT',
] as const;
export type ThreatMarker = (typeof THREAT_MARKERS)[number];

export const THREAT_VERDICTS = ['safe', 'caution', 'danger'] as const;
export type ThreatVerdict = (typeof THREAT_VERDICTS)[number];

export interface Threat {
  readonly verdict: ThreatVerdict;
  readonly markers: readonly ThreatMarker[];
  readonly auth: AuthResults;
}

export interface ThreatSignals {
  readonly auth: AuthResults;
  readonly isKnownSender: boolean;
  readonly from: MailSender;
  readonly links: readonly MailLink[];
  readonly attachments: readonly MailAttachment[];
}

/** A first message from someone is worth a look; every other marker is a real warning. */
const CAUTION_MARKERS: ReadonlySet<ThreatMarker> = new Set(['UNKNOWN_SENDER']);

const DETECTORS: Readonly<
  Record<ThreatMarker, (signals: ThreatSignals) => boolean>
> = {
  UNKNOWN_SENDER: (signals) => !signals.isKnownSender,
  AUTH_FAILED: (signals) => signals.auth.dmarc === 'fail',
  DISPLAY_NAME_SPOOF: (signals) => isDisplayNameSpoof(signals.from),
  LOOKALIKE_DOMAIN: (signals) => isLookalikeDomain(signals.from.domain),
  LINK_MISMATCH: (signals) => signals.links.some(isMismatchedLink),
  DANGEROUS_ATTACHMENT: (signals) =>
    signals.attachments.some(isDangerousAttachment),
};

export function verdictOf(markers: readonly ThreatMarker[]): ThreatVerdict {
  if (markers.length === 0) {
    return 'safe';
  }
  return markers.every((marker) => CAUTION_MARKERS.has(marker))
    ? 'caution'
    : 'danger';
}

export function assessThreat(signals: ThreatSignals): Threat {
  const markers = THREAT_MARKERS.filter((marker) => DETECTORS[marker](signals));
  return { verdict: verdictOf(markers), markers, auth: signals.auth };
}
