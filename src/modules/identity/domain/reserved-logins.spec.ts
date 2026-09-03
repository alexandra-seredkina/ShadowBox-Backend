import { parseLogin } from './login.js';
import { isReservedLogin, loginSkeleton } from './reserved-logins.js';

describe('isReservedLogin', () => {
  it.each([
    'admin',
    'postmaster',
    'abuse',
    'security',
    'noreply',
    'mailer-daemon',
  ])('reserves %j', (login) => {
    expect(isReservedLogin(parseLogin(login))).toBe(true);
  });

  it.each([
    ['digits for letters', 'p0stmaster'],
    ['rn for m', 'adrnin'],
    ['vv for w', 'vvebmaster'],
    ['separators', 'no.reply'],
    ['i for l', 'iegai'],
    ['fullwidth letters', 'ＡＤＭＩＮ'],
  ])('catches %s: %j', (_, login) => {
    expect(isReservedLogin(parseLogin(login))).toBe(true);
  });

  it.each(['kage', 'admiral', 'supporter', 'rooted'])('allows %j', (login) => {
    expect(isReservedLogin(parseLogin(login))).toBe(false);
  });

  it('rejects Cyrillic lookalikes before the reserved check', () => {
    expect(() => parseLogin('аdmin')).toThrow();
  });
});

describe('loginSkeleton', () => {
  it('maps lookalikes onto the letters they imitate', () => {
    expect(loginSkeleton('c1-3rn_0')).toBe('demo');
  });
});
