import { createConnection, Socket } from 'node:net';

/** One complete reply: the code and the text of its last line. */
export interface LmtpTestReply {
  readonly code: number;
  readonly text: string;
}

const REPLY_LINE = /^(\d{3})([ -])(.*)$/;

/** Speaks LMTP line by line, so tests see every reply exactly as sent. */
export class LmtpTestClient {
  private buffered = '';
  private continued: string[] = [];
  /** Text of every line of the last multi-line reply, such as LHLO capabilities. */
  lastLines: readonly string[] = [];
  private readonly replies: LmtpTestReply[] = [];
  private waiting: ((reply: LmtpTestReply) => void) | null = null;

  private constructor(private readonly socket: Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (data: string) => this.onData(data));
  }

  static async connect(port: number): Promise<LmtpTestClient> {
    const socket = createConnection({ host: '127.0.0.1', port });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    const client = new LmtpTestClient(socket);
    await client.reply();
    return client;
  }

  async command(line: string): Promise<LmtpTestReply> {
    this.socket.write(`${line}\r\n`);
    return this.reply();
  }

  /** Sends the message after DATA was accepted and returns one reply per recipient. */
  async data(
    message: string | Buffer,
    recipients: number,
  ): Promise<LmtpTestReply[]> {
    const text = (
      Buffer.isBuffer(message) ? message : Buffer.from(message, 'utf8')
    ).toString('latin1');
    const stuffed = text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    this.socket.write(Buffer.from(stuffed, 'latin1'));
    this.socket.write(stuffed.endsWith('\r\n') ? '.\r\n' : '\r\n.\r\n');
    const replies: LmtpTestReply[] = [];
    for (let i = 0; i < recipients; i += 1) {
      replies.push(await this.reply());
    }
    return replies;
  }

  /** Opens a transaction for the given recipients and returns their RCPT replies. */
  async envelope(recipients: readonly string[]): Promise<LmtpTestReply[]> {
    await this.command('LHLO test.example');
    await this.command('MAIL FROM:<sender@example.com>');
    const replies: LmtpTestReply[] = [];
    for (const recipient of recipients) {
      replies.push(await this.command(`RCPT TO:<${recipient}>`));
    }
    return replies;
  }

  close(): void {
    this.socket.destroy();
  }

  private reply(): Promise<LmtpTestReply> {
    const next = this.replies.shift();
    if (next !== undefined) {
      return Promise.resolve(next);
    }
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  private onData(data: string): void {
    this.buffered += data;
    let end = this.buffered.indexOf('\r\n');
    while (end >= 0) {
      const line = this.buffered.slice(0, end);
      this.buffered = this.buffered.slice(end + 2);
      const parsed = REPLY_LINE.exec(line);
      if (parsed !== null) {
        this.continued.push(parsed[3] ?? '');
        if (parsed[2] === ' ') {
          this.lastLines = this.continued;
          this.continued = [];
          this.deliver({ code: Number(parsed[1]), text: parsed[3] ?? '' });
        }
      }
      end = this.buffered.indexOf('\r\n');
    }
  }

  private deliver(reply: LmtpTestReply): void {
    const waiting = this.waiting;
    if (waiting === null) {
      this.replies.push(reply);
      return;
    }
    this.waiting = null;
    waiting(reply);
  }
}
