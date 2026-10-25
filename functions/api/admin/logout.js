import { json, sameOrigin, getSession, cookieHeader, needKV } from '../../_lib/auth.js';

// body {all:true} also invalidates every other signed-in session.
export async function onRequestPost({ request, env }) {
  const kv = needKV(env); if (kv) return kv;
  if (!sameOrigin(request)) return json({ error: 'Bad origin' }, 403);
  let b = {}; try { b = await request.json(); } catch {}
  if (b.all && (await getSession(request, env))) await env.ZT_KV.put('session_epoch', crypto.randomUUID());
  return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('', 0) });
}
