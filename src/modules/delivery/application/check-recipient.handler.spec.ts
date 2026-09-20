import { InMemoryRecipientDirectory } from '../../../../test/support/delivery-fakes.js';
import { FixedClock } from '../../../../test/support/kernel-fakes.js';
import { createTestConfig } from '../../../../test/support/test-config.js';
import { CheckRecipientHandler } from './check-recipient.handler.js';

const NOW = new Date('2020-01-15T12:00:00Z');

describe('CheckRecipientHandler', () => {
  let directory: InMemoryRecipientDirectory;
  let handler: CheckRecipientHandler;

  beforeEach(() => {
    directory = new InMemoryRecipientDirectory();
    handler = new CheckRecipientHandler(
      directory,
      createTestConfig(),
      new FixedClock(NOW),
    );
  });

  it('returns the recipient of a deliverable address', async () => {
    const recipient = directory.add('k7f3mz9q2a');

    expect(await handler.execute('K7F3MZ9Q2A@shadowbox.test')).toEqual(
      recipient,
    );
  });

  it('returns null for an address the directory does not deliver to', async () => {
    expect(await handler.execute('zzzzzzzzzz@shadowbox.test')).toBeNull();
    expect(directory.lookups).toBe(1);
  });

  it('refuses a foreign domain without a lookup', async () => {
    directory.add('k7f3mz9q2a');

    expect(await handler.execute('k7f3mz9q2a@example.com')).toBeNull();
    expect(directory.lookups).toBe(0);
  });
});
