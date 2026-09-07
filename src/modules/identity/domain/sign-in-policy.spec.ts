import { decideSignInGate } from './sign-in-policy.js';

const resetsAt = new Date('2020-01-15T12:15:00Z');
const window = (count: number): { count: number; resetsAt: Date | null } => ({
  count,
  resetsAt: count === 0 ? null : resetsAt,
});

describe('decideSignInGate', () => {
  it('lets the first four failures through freely', () => {
    expect(decideSignInGate({ login: window(4), ip: window(19) })).toEqual({
      kind: 'open',
    });
  });

  it('asks for proof-of-work from the fifth failure of a login', () => {
    expect(decideSignInGate({ login: window(5), ip: window(0) })).toEqual({
      kind: 'pow_required',
    });
  });

  it('asks for proof-of-work after twenty failures from one IP', () => {
    expect(decideSignInGate({ login: window(0), ip: window(20) })).toEqual({
      kind: 'pow_required',
    });
  });

  it('locks a login after ten failures until its window ends', () => {
    expect(decideSignInGate({ login: window(10), ip: window(0) })).toEqual({
      kind: 'locked',
      resetsAt,
    });
  });
});
