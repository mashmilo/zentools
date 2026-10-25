import { json, needKV, sameOrigin, verifyPassword, createSession, cookieHeader, SESSION_HOURS, clientIP, rateLimit } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const kv = needKV(env); if (kv) return kv;
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || !(env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD)) {
    return json({ error: 'Admin is not configured. Set ADMIN_PASSWORD_HASH and SESSION_SECRET (see README).' }, 503);
  }
  const ip = clientIP(request);
  if (!(await rateLimit(env, `login:${ip}`, 5, 900))) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
  let b; try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const ok = await verifyPassword(env, String(b.username || '').slice(0, 100), String(b.password || '').slice(0, 500));
  if (!ok) { await new Promise((r) => setTimeout(r, 500)); return json({ error: 'Wrong username or password.' }, 401); }
  const token = await createSession(env);
  return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader(token, SESSION_HOURS * 3600) });
}
