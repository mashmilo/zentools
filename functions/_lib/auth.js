// Auth helpers: PBKDF2 password check, HMAC-signed session cookie, CSRF/origin checks, rate limiting.
const enc = new TextEncoder();
const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};
export const COOKIE = '__Host-zt_session';
export const SESSION_HOURS = 8;

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export function needKV(env) {
  return env.ZT_KV ? null : json({ error: 'KV binding ZT_KV is not configured. See README step 4.' }, 503);
}

export function timingSafeEqual(a, b) {
  const x = typeof a === 'string' ? enc.encode(a) : a, y = typeof b === 'string' ? enc.encode(b) : b;
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function verifyPassword(env, user, password) {
  const expectedUser = env.ADMIN_USER || 'admin';
  let ok = timingSafeEqual(user || '', expectedUser);
  if (env.ADMIN_PASSWORD_HASH) {
    const [scheme, iterStr, saltB, hashB] = env.ADMIN_PASSWORD_HASH.split('$');
    if (scheme !== 'pbkdf2') return false;
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64u.dec(saltB), iterations: Math.min(parseInt(iterStr, 10) || 100000, 100000), hash: 'SHA-256' }, key, 256));
    return timingSafeEqual(bits, b64u.dec(hashB)) && ok;
  }
  if (env.ADMIN_PASSWORD) return timingSafeEqual(password || '', env.ADMIN_PASSWORD) && ok;
  return false;
}

export async function createSession(env) {
  const epoch = (await env.ZT_KV.get('session_epoch')) || '0';
  const payload = b64u.enc(enc.encode(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600e3, ep: epoch, n: crypto.randomUUID() })));
  const sig = b64u.enc(await hmac(env.SESSION_SECRET, payload));
  return `${payload}.${sig}`;
}

export const cookieHeader = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

export async function getSession(request, env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return null;
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return null;
  const good = b64u.enc(await hmac(env.SESSION_SECRET, payload));
  if (!timingSafeEqual(sig, good)) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(b64u.dec(payload))); } catch { return null; }
  if (!data.exp || data.exp < Date.now()) return null;
  const epoch = (await env.ZT_KV.get('session_epoch')) || '0';
  return data.ep === epoch ? data : null;
}

// Blocks cross-site requests: Origin must match host and the custom header must be present.
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try { if (new URL(origin).host !== new URL(request.url).host) return false; } catch { return false; }
  return request.headers.get('X-ZT') === '1';
}

export async function requireAdmin(request, env) {
  const kv = needKV(env); if (kv) return { res: kv };
  if (request.method !== 'GET' && !sameOrigin(request)) return { res: json({ error: 'Bad origin' }, 403) };
  const s = await getSession(request, env);
  return s ? { session: s } : { res: json({ error: 'Not signed in' }, 401) };
}

export const clientIP = (request) => request.headers.get('CF-Connecting-IP') || 'unknown';

// Simple fixed-window limiter on KV (good enough for login / proxy abuse protection).
export async function rateLimit(env, key, limit, windowSec) {
  const k = `rl:${key}`;
  const n = parseInt((await env.ZT_KV.get(k)) || '0', 10);
  if (n >= limit) return false;
  await env.ZT_KV.put(k, String(n + 1), { expirationTtl: Math.max(60, windowSec) });
  return true;
}
