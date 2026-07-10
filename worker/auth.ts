/* Writer's Codex — Worker auth.
 *
 * Identity comes from Cloudflare Access. After a user completes the one-time-PIN login, Access sets a
 * domain cookie (CF_Authorization) and, on requests that pass through an Access-protected path,
 * injects the `Cf-Access-Jwt-Assertion` header. Either carries a signed RS256 JWT. We verify it
 * against the team's public JWKS and derive a stable userId (sha256 of the verified email).
 *
 * This code is agnostic to HOW Access is scoped (whole hostname, or just a login path): as long as a
 * valid Access JWT reaches the Worker, sync is authorized. In `wrangler dev` there is no Access, so
 * `env.DEV_USER` short-circuits verification with a fixed local identity. DEV_USER is never set in prod.
 */

import type { Context, Next } from 'hono';
import type { Env, Vars } from './index';

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

/* ---------- small encodings ---------- */

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

/** Stable, non-reversible user id from an email — the partition key for all of a user's rows. */
export async function userIdFromEmail(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.trim().toLowerCase());
  return bytesToHex(await crypto.subtle.digest('SHA-256', data));
}

/* ---------- JWKS (cached per isolate) ---------- */

interface Jwk extends JsonWebKey {
  kid: string;
}
let jwksCache: { byKid: Map<string, Promise<CryptoKey>>; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1h

async function getKeys(teamDomain: string): Promise<Map<string, Promise<CryptoKey>>> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.byKid;
  const res = await fetch(`${teamDomain.replace(/\/$/, '')}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const byKid = new Map<string, Promise<CryptoKey>>();
  for (const jwk of keys) {
    byKid.set(
      jwk.kid,
      crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
    );
  }
  jwksCache = { byKid, fetchedAt: now };
  return byKid;
}

/* ---------- token extraction + verification ---------- */

function readToken(c: Ctx): string | null {
  const header = c.req.header('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = c.req.header('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

interface AccessClaims {
  email?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
}

/** Verify an Access JWT; return the email on success, or null on any failure. */
async function verify(token: string, env: Env): Promise<string | null> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!teamDomain || !aud) return null; // misconfigured → deny (fail closed)

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headB64, payloadB64, sigB64] = parts;

  let head: { kid?: string; alg?: string };
  let claims: AccessClaims;
  try {
    head = JSON.parse(new TextDecoder().decode(b64urlToBytes(headB64)));
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  } catch {
    return null;
  }
  if (head.alg !== 'RS256' || !head.kid) return null;

  const keys = await getKeys(teamDomain);
  const keyPromise = keys.get(head.kid);
  if (!keyPromise) return null;
  const key = await keyPromise;

  const signed = new TextEncoder().encode(`${headB64}.${payloadB64}`);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sigB64), signed);
  if (!ok) return null;

  // claim checks
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp < now) return null;
  const audOk = Array.isArray(claims.aud) ? claims.aud.includes(aud) : claims.aud === aud;
  if (!audOk) return null;
  if (claims.iss && teamDomain && !claims.iss.startsWith(teamDomain.replace(/\/$/, ''))) return null;
  if (!claims.email) return null;
  return claims.email;
}

/* ---------- middleware ---------- */

/** Resolve identity without failing — sets userId/email if present, leaves them unset otherwise. */
export async function resolveIdentity(c: Ctx): Promise<boolean> {
  // Dev bypass: local `wrangler dev` has no Access. Never set in production.
  if (c.env.DEV_USER) {
    c.set('email', c.env.DEV_USER);
    c.set('userId', await userIdFromEmail(c.env.DEV_USER));
    return true;
  }
  const token = readToken(c);
  if (!token) return false;
  const email = await verify(token, c.env);
  if (!email) return false;
  c.set('email', email);
  c.set('userId', await userIdFromEmail(email));
  return true;
}

/** Gate: 401 unless a valid identity is present. Attach to every protected /api route. */
export async function requireAuth(c: Ctx, next: Next): Promise<Response | void> {
  const ok = await resolveIdentity(c);
  if (!ok) return c.json({ error: 'unauthenticated' }, 401);
  await next();
}
