/** Wire formats from API.md §1.3. */
export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function toApiInstant(instant: Date): string {
  return instant.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
