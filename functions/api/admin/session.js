import { json, getSession, needKV } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const kv = needKV(env); if (kv) return kv;
  const s = await getSession(request, env);
  return json({ authenticated: !!s, configured: !!(env.SESSION_SECRET && (env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD)) });
}
