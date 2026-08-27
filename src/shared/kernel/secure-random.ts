export abstract class SecureRandom {
  abstract bytes(length: number): Uint8Array;
}
