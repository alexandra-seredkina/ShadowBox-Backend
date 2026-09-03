import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import { IpHasher } from '../../../shared/kernel/ip-hasher.js';
import { SecureRandom } from '../../../shared/kernel/secure-random.js';
import type { ClientContext } from '../domain/client-context.js';
import { describeDevice } from '../domain/device.js';
import {
  draftSession,
  SESSION_TOKEN_BYTES,
  SessionDraft,
} from '../domain/session.js';

export interface IssuedSession {
  /** Goes to the cookie only; the server keeps its SHA-256. */
  readonly token: Uint8Array;
  readonly draft: SessionDraft;
}

@Injectable()
export class SessionIssuer {
  constructor(
    private readonly random: SecureRandom,
    private readonly ipHasher: IpHasher,
    private readonly clock: Clock,
  ) {}

  issue(params: {
    readonly client: ClientContext;
    readonly isIpBound: boolean;
  }): IssuedSession {
    const token = this.random.bytes(SESSION_TOKEN_BYTES);
    const draft = draftSession({
      token,
      ip: this.ipHasher.hash(params.client.ip),
      isIpBound: params.isIpBound,
      device: describeDevice(params.client.userAgent),
      now: this.clock.now(),
    });
    return { token, draft };
  }
}
