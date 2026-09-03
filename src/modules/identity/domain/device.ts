const MAX_USER_AGENT_LENGTH = 512;
const UNKNOWN = 'Other';

/** Order matters: Edge and Opera also claim Chrome, Chrome also claims Safari. */
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\//, 'Opera'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const OPERATING_SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\bAndroid\b/, 'Android'],
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b/, 'macOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bLinux\b/, 'Linux'],
];

function firstMatch(
  userAgent: string,
  candidates: readonly (readonly [RegExp, string])[],
): string {
  return (
    candidates.find(([pattern]) => pattern.test(userAgent))?.[1] ?? UNKNOWN
  );
}

/** Coarse "browser · OS"; the full User-Agent is never stored. */
export function describeDevice(userAgent: string | undefined): string {
  const source = (userAgent ?? '').slice(0, MAX_USER_AGENT_LENGTH);
  return `${firstMatch(source, BROWSERS)} · ${firstMatch(source, OPERATING_SYSTEMS)}`;
}
