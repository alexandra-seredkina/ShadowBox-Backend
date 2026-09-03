/** Where a request came from; neither value is stored as is. */
export interface ClientContext {
  readonly ip: string;
  readonly userAgent: string | undefined;
}
