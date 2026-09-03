import type { AccountId } from './account.js';
import type { Login } from './login.js';
import {
  fromRegistrationSnapshot,
  RegistrationResult,
  toRegistrationSnapshot,
} from './registration.js';

const result: RegistrationResult = {
  account: {
    id: '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0d' as AccountId,
    login: 'kage' as Login,
    createdAt: new Date('2020-01-15T12:00:00.123Z'),
    isIpBindingEnabled: true,
    activeAliases: 1,
  },
  firstAlias: {
    id: '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0e',
    localPart: 'k7f3mz9q2a',
    domain: 'shadowbox.test',
    kind: 'permanent',
    status: 'active',
    folderId: null,
    expiresAt: null,
    createdAt: new Date('2020-01-15T12:00:00.123Z'),
    lastReceivedAt: null,
  },
};

describe('registration snapshot', () => {
  it('survives a JSON round trip unchanged', () => {
    const stored: unknown = JSON.parse(
      JSON.stringify(toRegistrationSnapshot(result)),
    );

    expect(fromRegistrationSnapshot(stored)).toEqual(result);
  });

  it('refuses a snapshot of another shape', () => {
    expect(() => fromRegistrationSnapshot({ account: {} })).toThrow();
  });
});
