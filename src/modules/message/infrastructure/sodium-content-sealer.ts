import { Injectable } from '@nestjs/common';
import { sealEncryptedBlob } from '../../../infrastructure/crypto/encrypted-blob.js';
import type { EncryptedBlob } from '../../../shared/kernel/encrypted-blob.js';
import { SecureRandom } from '../../../shared/kernel/secure-random.js';
import { ContentSealer } from '../domain/content-sealer.js';

@Injectable()
export class SodiumContentSealer implements ContentSealer {
  constructor(private readonly random: SecureRandom) {}

  seal(publicKey: Uint8Array, plaintext: Uint8Array): EncryptedBlob {
    return sealEncryptedBlob({ publicKey, plaintext, random: this.random });
  }
}
