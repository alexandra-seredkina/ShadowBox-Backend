import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { IpHash, IpHasher } from '../../shared/kernel/ip-hasher.js';

const DOMAIN_LABEL = 'shadowbox/client-ip/v1\0';

@Injectable()
export class HmacIpHasher implements IpHasher {
  private readonly key: Uint8Array;
  private readonly keyVersion: number;

  constructor(config: AppConfig) {
    this.key = config.ipHashKey;
    this.keyVersion = config.ipHashKeyVersion;
  }

  hash(ip: string): IpHash {
    const hash = createHmac('sha256', this.key)
      .update(DOMAIN_LABEL)
      .update(ip, 'utf8')
      .digest();
    return { hash, keyVersion: this.keyVersion };
  }

  matches(ip: string, stored: IpHash): boolean {
    if (stored.keyVersion !== this.keyVersion) {
      return false;
    }
    const current = this.hash(ip).hash;
    return (
      current.length === stored.hash.length &&
      timingSafeEqual(current, stored.hash)
    );
  }
}
