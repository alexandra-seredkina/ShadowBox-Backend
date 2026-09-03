import { randomBytes } from 'node:crypto';
import { Global, Injectable, Module } from '@nestjs/common';
import { IpHasher } from '../../shared/kernel/ip-hasher.js';
import { SecureRandom } from '../../shared/kernel/secure-random.js';
import { HmacIpHasher } from './hmac-ip-hasher.js';

@Injectable()
export class NodeSecureRandom implements SecureRandom {
  bytes(length: number): Uint8Array {
    return randomBytes(length);
  }
}

@Global()
@Module({
  providers: [
    { provide: SecureRandom, useClass: NodeSecureRandom },
    { provide: IpHasher, useClass: HmacIpHasher },
  ],
  exports: [SecureRandom, IpHasher],
})
export class CryptoModule {}
