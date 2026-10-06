import { env } from 'cloudflare:workers';
export function database() { if (!env.DB) throw new Error('Signalling unavailable'); return env.DB; }
