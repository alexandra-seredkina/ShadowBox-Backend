import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import type {
  MessageCursor,
  MessageFolderId,
  MessageId,
} from '../domain/message.js';
import { decodeCursor, encodeCursor } from './message-cursor.js';

const CURSOR: MessageCursor = {
  folderId: '0192f0a0-0000-7000-8000-000000000001' as MessageFolderId,
  receivedAt: new Date('2020-01-15T12:00:00.123Z'),
  id: '0192f0a0-0000-7000-8000-000000000002' as MessageId,
};

describe('message cursor', () => {
  it('round-trips with millisecond precision', () => {
    expect(decodeCursor(encodeCursor(CURSOR))).toEqual(CURSOR);
  });

  it('is URL-safe', () => {
    expect(encodeCursor(CURSOR)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    '',
    'not-a-cursor',
    Buffer.from('a|b|c').toString('base64url'),
    Buffer.from(`${CURSOR.folderId}|-1|${CURSOR.id}`).toString('base64url'),
    Buffer.from(`${CURSOR.folderId}|1|${CURSOR.id}|extra`).toString(
      'base64url',
    ),
  ])('refuses %j', (raw) => {
    expect(() => decodeCursor(raw)).toThrow(ValidationFailedError);
  });
});
