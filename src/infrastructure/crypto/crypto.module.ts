import { randomBytes } from 'node:crypto';
import { Global, Injectable, Module } from '@nestjs/common';
import { SecureRandom } from '../../shared/kernel/secure-random.js';

@Injectable()
export class NodeSecureRandom implements SecureRandom {
  bytes(length: number): Uint8Array {
    return randomBytes(length);
  }
}

@Global()
@Module({
  providers: [{ provide: SecureRandom, useClass: NodeSecureRandom }],
  exports: [SecureRandom],
})
export class CryptoModule {}
