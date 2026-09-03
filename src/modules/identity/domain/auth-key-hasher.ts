/** Server-side Argon2id over the client-derived authKey (D-003). */
export abstract class AuthKeyHasher {
  abstract hash(authKey: Uint8Array): Promise<string>;

  /** False for a wrong key and for a malformed hash alike. */
  abstract verify(hash: string, authKey: Uint8Array): Promise<boolean>;

  /** True when the hash was made with weaker parameters than the current ones. */
  abstract needsRehash(hash: string): boolean;
}
