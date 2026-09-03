import type { Login } from './login.js';

const RESERVED_LOGINS: readonly string[] = [
  'abuse',
  'admin',
  'administrator',
  'api',
  'billing',
  'contact',
  'help',
  'hostmaster',
  'info',
  'legal',
  'mail',
  'mailer-daemon',
  'moderator',
  'noreply',
  'official',
  'owner',
  'postmaster',
  'privacy',
  'root',
  'security',
  'shadowbox',
  'staff',
  'support',
  'system',
  'team',
  'webmaster',
];

/** Digits and letters that read like another letter, then pairs that read like one. */
const LOOKALIKE_SEQUENCES: readonly (readonly [string, string])[] = [
  ['rn', 'm'],
  ['vv', 'w'],
  ['cl', 'd'],
];
const LOOKALIKE_CHARACTERS: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'l',
  i: 'l',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
};

/** Reduces a login to how it looks, ignoring separators and lookalike characters. */
export function loginSkeleton(login: string): string {
  let skeleton = login
    .replace(/[._-]/g, '')
    .replace(/./g, (character) => LOOKALIKE_CHARACTERS[character] ?? character);
  for (const [sequence, replacement] of LOOKALIKE_SEQUENCES) {
    skeleton = skeleton.replaceAll(sequence, replacement);
  }
  return skeleton;
}

const RESERVED_SKELETONS: ReadonlySet<string> = new Set(
  RESERVED_LOGINS.map(loginSkeleton),
);

export function isReservedLogin(login: Login): boolean {
  return RESERVED_SKELETONS.has(loginSkeleton(login));
}
