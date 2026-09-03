/** HMAC of a client IP; the raw address is never stored (security_quality.md §2). */
export interface IpHash {
  readonly hash: Uint8Array;
  readonly keyVersion: number;
}

export abstract class IpHasher {
  abstract hash(ip: string): IpHash;
}
