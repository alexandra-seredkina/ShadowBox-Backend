import { z } from 'zod';
import { POW_PURPOSES } from '../domain/pow-challenge.js';

/** Generous outer bound: the exact login rules run after NFKC in the domain. */
const RAW_LOGIN_MAX_LENGTH = 128;

export const powRequestSchema = z.strictObject({
  purpose: z.enum(POW_PURPOSES),
});
export type PowRequest = z.infer<typeof powRequestSchema>;

export const preloginRequestSchema = z.strictObject({
  login: z.string().max(RAW_LOGIN_MAX_LENGTH),
});
export type PreloginRequest = z.infer<typeof preloginRequestSchema>;
