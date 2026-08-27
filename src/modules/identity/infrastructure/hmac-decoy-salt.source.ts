import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import { DecoySaltSource } from '../domain/decoy-salt.source.js';
import { KDF_SALT_BYTES } from '../domain/kdf-params.js';
import type { Login } from '../domain/login.js';

const DOMAIN_LABEL = 'shadowbox/prelogin-decoy-salt/v1\0';

@Injectable()
export class HmacDecoySaltSource implements DecoySaltSource {
  private readonly key: Uint8Array;

  constructor(config: AppConfig) {
    this.key = config.preloginSaltKey;
  }

  saltFor(login: Login): Uint8Array {
    return createHmac('sha256', this.key)
      .update(DOMAIN_LABEL)
      .update(login, 'utf8')
      .digest()
      .subarray(0, KDF_SALT_BYTES);
  }
}
