import type { AddressInfo } from 'node:net';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  SMTPServer,
  SMTPServerAddress,
  SMTPServerDataStream,
  SMTPServerEnvelope,
  SMTPServerSession,
} from 'smtp-server';
import { AppConfig } from '../../../config/app-config.js';
import { MAX_MESSAGE_BYTES } from '../../../shared/kernel/message-size.js';
import { CheckRecipientHandler } from '../application/check-recipient.handler.js';
import { MAX_RECIPIENTS_PER_MESSAGE, Recipient } from '../domain/recipient.js';

const MAX_CLIENTS = 20;

/** An SMTP reply as smtp-server expects it: an Error carrying the code. */
export class LmtpReply extends Error {
  constructor(
    readonly responseCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'LmtpReply';
  }
}

/** Every refused address gets this, so the reply never tells which ones exist. */
export const RECIPIENT_REJECTED = new LmtpReply(
  550,
  '5.1.1 Recipient address rejected',
);
export const TOO_MANY_RECIPIENTS = new LmtpReply(
  452,
  '4.5.3 Too many recipients',
);
export const MESSAGE_TOO_BIG = new LmtpReply(
  552,
  '5.3.4 Message size exceeds fixed limit',
);
export const TEMPORARY_FAILURE = new LmtpReply(
  451,
  '4.3.0 Temporary failure, try again later',
);

type LmtpDataCallback = (
  error: Error | null,
  replies?: ReadonlyArray<string | Error>,
) => void;

/**
 * Takes mail from the MTA over LMTP. It must only ever listen on an internal
 * interface: LMTP has no authentication and trusts the XFORWARD data it gets.
 */
@Injectable()
export class LmtpListener implements OnApplicationShutdown {
  private server: SMTPServer | null = null;
  /** Recipients accepted in the current transaction; smtp-server makes a new envelope for each. */
  private readonly accepted = new WeakMap<
    SMTPServerEnvelope,
    Map<string, Recipient>
  >();

  constructor(
    private readonly config: AppConfig,
    private readonly checkRecipient: CheckRecipientHandler,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(LmtpListener.name);
  }

  async listen(): Promise<AddressInfo> {
    const server = new SMTPServer({
      lmtp: true,
      name: this.config.mailDomain,
      size: MAX_MESSAGE_BYTES,
      authOptional: true,
      disabledCommands: ['AUTH', 'STARTTLS'],
      useXForward: true,
      maxClients: MAX_CLIENTS,
      logger: false,
      onRcptTo: (address, session, callback) => {
        this.acceptRecipient(address, session).then(
          () => callback(),
          (error: unknown) => callback(this.toReply(error)),
        );
      },
      onData: (stream, session, callback) => {
        this.receive(stream, session, callback as LmtpDataCallback);
      },
    });
    server.on('error', (error) => {
      this.logger.error({ err: error }, 'LMTP server error');
    });
    this.server = server;
    const address = await new Promise<AddressInfo>((resolve, reject) => {
      server.server.once('error', reject);
      server.listen(this.config.lmtpPort, this.config.lmtpHost, () => {
        server.server.off('error', reject);
        resolve(server.server.address() as AddressInfo);
      });
    });
    this.logger.info(
      { host: address.address, port: address.port },
      'LMTP listening',
    );
    return address;
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server !== null) {
      await new Promise<void>((resolve) => server.close(resolve));
    }
  }

  private async acceptRecipient(
    address: SMTPServerAddress,
    session: SMTPServerSession,
  ): Promise<void> {
    const accepted = this.acceptedIn(session.envelope);
    const key = address.address.toLowerCase();
    if (!accepted.has(key) && accepted.size >= MAX_RECIPIENTS_PER_MESSAGE) {
      throw TOO_MANY_RECIPIENTS;
    }
    const recipient = await this.checkRecipient.execute(address.address);
    if (recipient === null) {
      throw RECIPIENT_REJECTED;
    }
    accepted.set(key, recipient);
  }

  private receive(
    stream: SMTPServerDataStream,
    session: SMTPServerSession,
    callback: LmtpDataCallback,
  ): void {
    readLimited(stream, MAX_MESSAGE_BYTES).then(
      (raw) => {
        if (raw === null) {
          callback(MESSAGE_TOO_BIG);
          return;
        }
        raw.fill(0);
        callback(
          null,
          session.envelope.rcptTo.map(() => TEMPORARY_FAILURE),
        );
      },
      (error: unknown) => callback(this.toReply(error)),
    );
  }

  private acceptedIn(envelope: SMTPServerEnvelope): Map<string, Recipient> {
    let accepted = this.accepted.get(envelope);
    if (accepted === undefined) {
      accepted = new Map();
      this.accepted.set(envelope, accepted);
    }
    return accepted;
  }

  /** Expected refusals pass through; anything else is logged and deferred. */
  private toReply(error: unknown): LmtpReply {
    if (error instanceof LmtpReply) {
      return error;
    }
    this.logger.error({ err: error }, 'LMTP transaction failed');
    return TEMPORARY_FAILURE;
  }
}

/**
 * Buffers the message in memory, never on disk. Past the limit the rest is
 * drained and dropped, and null tells the caller to refuse it.
 */
export async function readLimited(
  stream: NodeJS.ReadableStream,
  limit: number,
): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += bytes.length;
    if (size <= limit) {
      chunks.push(bytes);
    } else {
      bytes.fill(0);
    }
  }
  const message = size <= limit ? Buffer.concat(chunks, size) : null;
  for (const chunk of chunks) {
    chunk.fill(0);
  }
  return message;
}
