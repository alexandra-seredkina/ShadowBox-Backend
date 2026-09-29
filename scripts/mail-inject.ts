/**
 * Hands a message to the delivery service over LMTP, the way the MTA does,
 * so mail can be tried locally without Postfix:
 *
 *   npm run mail:inject -- --to <address> [--to <address>] --file <message.eml>
 *   npm run mail:inject -- --to <address> --large-mib 20
 *
 * Runs with Node's own TypeScript support, so it imports nothing from src/.
 */
import { readFile } from 'node:fs/promises';
import { createConnection, type Socket } from 'node:net';
import { parseArgs } from 'node:util';

export interface LmtpReply {
  readonly code: number;
  readonly text: string;
}

export interface RecipientResult extends LmtpReply {
  readonly address: string;
}

export interface InjectOptions {
  readonly host: string;
  readonly port: number;
  /** Envelope sender; empty for a bounce. */
  readonly from: string;
  readonly to: readonly string[];
  readonly message: Buffer;
  /** Sent with XFORWARD, so SPF is checked as if mail came from this address. */
  readonly clientIp: string | null;
}

const REPLY_LINE = /^(\d{3})([ -])(.*)$/;
const MIB = 1024 * 1024;

/** Reads complete replies, joining the lines of multi-line ones. */
class Conversation {
  private buffered = '';
  private readonly replies: LmtpReply[] = [];
  private waiting: ((reply: LmtpReply) => void) | null = null;
  private failure: Error | null = null;
  private readonly socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
    socket.setEncoding('latin1');
    socket.on('data', (data: string) => this.onData(data));
    socket.on('error', (error) => {
      this.failure = error;
    });
  }

  async send(line: string): Promise<LmtpReply> {
    this.socket.write(`${line}\r\n`);
    return this.reply();
  }

  write(data: Buffer): void {
    this.socket.write(data);
  }

  reply(): Promise<LmtpReply> {
    const next = this.replies.shift();
    if (next !== undefined) {
      return Promise.resolve(next);
    }
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    return new Promise((resolve, reject) => {
      this.waiting = resolve;
      this.socket.once('close', () =>
        reject(new Error('LMTP server closed the connection')),
      );
    });
  }

  close(): void {
    this.socket.end();
  }

  private onData(data: string): void {
    this.buffered += data;
    let end = this.buffered.indexOf('\r\n');
    while (end >= 0) {
      const match = REPLY_LINE.exec(this.buffered.slice(0, end));
      this.buffered = this.buffered.slice(end + 2);
      if (match?.[2] === ' ') {
        this.deliver({ code: Number(match[1]), text: match[3] ?? '' });
      }
      end = this.buffered.indexOf('\r\n');
    }
  }

  private deliver(reply: LmtpReply): void {
    const waiting = this.waiting;
    this.waiting = null;
    if (waiting === null) {
      this.replies.push(reply);
    } else {
      waiting(reply);
    }
  }
}

function requireCode(reply: LmtpReply, code: number, step: string): void {
  if (reply.code !== code) {
    throw new Error(`${step} refused: ${reply.code} ${reply.text}`);
  }
}

/** CRLF line ends and a leading dot doubled, as the DATA command requires. */
export function toDataPayload(message: Buffer): Buffer {
  const text = message
    .toString('latin1')
    .replace(/\r?\n/g, '\r\n')
    .replace(/^\./gm, '..');
  const ended = text.endsWith('\r\n') ? text : `${text}\r\n`;
  return Buffer.from(`${ended}.\r\n`, 'latin1');
}

async function connect(host: string, port: number): Promise<Conversation> {
  const socket = createConnection({ host, port });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  const conversation = new Conversation(socket);
  requireCode(await conversation.reply(), 220, 'Connection');
  return conversation;
}

/** One reply per recipient: refused addresses keep their RCPT reply. */
export async function injectMail(
  options: InjectOptions,
): Promise<RecipientResult[]> {
  const lmtp = await connect(options.host, options.port);
  try {
    requireCode(await lmtp.send('LHLO mail-inject.localhost'), 250, 'LHLO');
    if (options.clientIp !== null) {
      const forward = `XFORWARD ADDR=${options.clientIp} HELO=mail-inject.localhost`;
      requireCode(await lmtp.send(forward), 250, 'XFORWARD');
    }
    requireCode(
      await lmtp.send(`MAIL FROM:<${options.from}>`),
      250,
      'MAIL FROM',
    );
    const results: RecipientResult[] = [];
    const accepted: string[] = [];
    for (const address of options.to) {
      const reply = await lmtp.send(`RCPT TO:<${address}>`);
      if (reply.code === 250) {
        accepted.push(address);
      } else {
        results.push({ address, ...reply });
      }
    }
    if (accepted.length > 0) {
      requireCode(await lmtp.send('DATA'), 354, 'DATA');
      lmtp.write(toDataPayload(options.message));
      for (const address of accepted) {
        results.push({ address, ...(await lmtp.reply()) });
      }
    }
    await lmtp.send('QUIT');
    return results;
  } finally {
    lmtp.close();
  }
}

/** A plain message with one attachment of about `mib` MiB, for size limits. */
export function largeMessage(mib: number): Buffer {
  const payload = Buffer.alloc(Math.round(mib * MIB * 0.75), 0x41);
  const base64 = payload.toString('base64').replace(/.{76}/g, '$&\r\n');
  return Buffer.from(
    [
      'From: "Archive" <archive@files.example>',
      'To: you@shadowbox.test',
      `Subject: Archive of about ${mib} MiB`,
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="part"',
      '',
      '--part',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'The archive you asked for is attached.',
      '--part',
      'Content-Type: application/octet-stream',
      'Content-Disposition: attachment; filename="archive.bin"',
      'Content-Transfer-Encoding: base64',
      '',
      base64,
      '--part--',
      '',
    ].join('\r\n'),
  );
}

/** The address in the first From header, used as the envelope sender by default. */
export function headerSender(message: Buffer): string {
  const head = message.subarray(0, 64 * 1024).toString('latin1');
  const from = /^From:[^\r\n]*?([^\s<>"]+@[^\s<>"]+)/im.exec(head);
  return from?.[1] ?? '';
}

const USAGE =
  'Usage: npm run mail:inject -- --to <address> (--file <message.eml> | --large-mib <n>) [--from <address>] [--client-ip <ip>] [--host 127.0.0.1] [--port 2424]';

function readArguments() {
  const { values } = parseArgs({
    options: {
      to: { type: 'string', multiple: true, default: [] },
      file: { type: 'string' },
      'large-mib': { type: 'string' },
      from: { type: 'string' },
      'client-ip': { type: 'string' },
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'string', default: '2424' },
    },
  });
  const hasOneSource =
    (values.file === undefined) !== (values['large-mib'] === undefined);
  if (values.to.length === 0 || !hasOneSource) {
    throw new Error(USAGE);
  }
  return values;
}

async function main(): Promise<void> {
  const args = readArguments();
  const message =
    args.file === undefined
      ? largeMessage(Number(args['large-mib']))
      : await readFile(args.file);
  const results = await injectMail({
    host: args.host,
    port: Number(args.port),
    from: args.from ?? headerSender(message),
    to: args.to,
    message,
    clientIp: args['client-ip'] ?? null,
  });
  for (const result of results) {
    process.stdout.write(`${result.code} ${result.text}  ${result.address}\n`);
  }
  process.exitCode = results.every((result) => result.code === 250) ? 0 : 1;
}

if (import.meta.main) {
  await main();
}
