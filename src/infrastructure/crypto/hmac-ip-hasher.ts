import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { IpHash, IpHasher } from '../../shared/kernel/ip-hasher.js';

const DOMAIN_LABEL = 'shadowbox/client-ip/v1\0';

function hmac(key: Uint8Array, ip: string): Buffer {
  return createHmac('sha256', key)
    .update(DOMAIN_LABEL)
    .update(ip, 'utf8')
    .digest();
}

@Injectable()
export class HmacIpHasher implements IpHasher {
  private readonly keysByVersion: ReadonlyMap<number, Uint8Array>;
  private readonly currentVersion: number;
  private readonly currentKey: Uint8Array;

  constructor(config: AppConfig) {
    this.currentVersion = config.ipHashKeyVersion;
    this.currentKey = config.ipHashKey;
    const keys = new Map([[config.ipHashKeyVersion, config.ipHashKey]]);
    if (config.ipHashPreviousKey !== null) {
      keys.set(config.ipHashKeyVersion - 1, config.ipHashPreviousKey);
    }
    this.keysByVersion = keys;
  }

  hash(ip: string): IpHash {
    return { hash: hmac(this.currentKey, ip), keyVersion: this.currentVersion };
  }

  matches(ip: string, stored: IpHash): boolean {
    const key = this.keysByVersion.get(stored.keyVersion);
    if (key === undefined) {
      return false;
    }
    const candidate = hmac(key, ip);
    return (
      candidate.length === stored.hash.length &&
      timingSafeEqual(candidate, stored.hash)
    );
  }

  isCurrent(stored: IpHash): boolean {
    return stored.keyVersion === this.currentVersion;
  }
}
