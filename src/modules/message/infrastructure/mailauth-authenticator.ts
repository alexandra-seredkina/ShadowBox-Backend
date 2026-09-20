import { Injectable } from '@nestjs/common';
import {
  authenticate,
  type AuthenticateOptions,
  type AuthenticateResult,
  type AuthStatus,
  type DKIMResult,
  type DNSResolver,
} from 'mailauth';
import { AppConfig } from '../../../config/app-config.js';
import type { MailEnvelope } from '../domain/inbound-mail.js';
import { MailAuthenticator } from '../domain/mail-authenticator.js';
import type { AuthResult, AuthResults } from '../domain/threat.js';

/** softfail is "probably not allowed": for a reader that is a failure too. */
function authResultOf(status: AuthStatus): AuthResult {
  switch (status.result) {
    case 'pass':
      return 'pass';
    case 'fail':
    case 'softfail':
      return 'fail';
    default:
      return 'none';
  }
}

/** One good signature is enough; a broken one only counts when nothing passed. */
function dkimResultOf(results: readonly DKIMResult[]): AuthResult {
  const outcomes = results.map((result) => authResultOf(result.status));
  if (outcomes.includes('pass')) {
    return 'pass';
  }
  return outcomes.includes('fail') ? 'fail' : 'none';
}

export function authResultsOf(result: AuthenticateResult): AuthResults {
  return {
    spf: result.spf === false ? 'none' : authResultOf(result.spf.status),
    dkim: dkimResultOf(result.dkim.results),
    dmarc: result.dmarc === false ? 'none' : authResultOf(result.dmarc.status),
  };
}

@Injectable()
export class MailauthAuthenticator implements MailAuthenticator {
  private resolver: DNSResolver | null = null;

  constructor(private readonly config: AppConfig) {}

  /** Tests answer DNS queries themselves instead of asking the network. */
  static usingResolver(
    config: AppConfig,
    resolver: DNSResolver,
  ): MailauthAuthenticator {
    const authenticator = new MailauthAuthenticator(config);
    authenticator.resolver = resolver;
    return authenticator;
  }

  async verify(raw: Uint8Array, envelope: MailEnvelope): Promise<AuthResults> {
    const options: AuthenticateOptions = {
      ip: envelope.clientIp,
      helo: envelope.helo,
      mta: this.config.mailDomain,
      disableArc: true,
      disableBimi: true,
      ...(envelope.mailFrom === null ? {} : { sender: envelope.mailFrom }),
      ...(this.resolver === null ? {} : { resolver: this.resolver }),
    };
    const message = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    return authResultsOf(await authenticate(message, options));
  }
}
