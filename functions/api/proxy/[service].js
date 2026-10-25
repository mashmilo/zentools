// Secure server-side proxy so tools can use paid/free APIs without exposing keys in the browser.
// Configure each service in Admin > API keys. Tools call: ctx.api('service-name', payload)
import { json, needKV, clientIP, rateLimit } from '../../_lib/auth.js';
import { loadSettings } from '../../_lib/defaults.js';

const MAX_BODY = 12 * 1024 * 1024;

export async function onRequest({ request, env, params }) {
  if (request.method !== 'POST' && request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const kv = needKV(env); if (kv) return kv;
  const name = String(params.service || '');
  if (!/^[a-z0-9_-]{1,40}$/.test(name)) return json({ error: 'Bad service name' }, 400);

  // Only our own pages may call the proxy.
  const origin = request.headers.get('Origin');
  if (origin) { try { if (new URL(origin).host !== new URL(request.url).host) return json({ error: 'Forbidden' }, 403); } catch { return json({ error: 'Forbidden' }, 403); } }
  else if (request.headers.get('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin') return json({ error: 'Forbidden' }, 403);

  const s = await loadSettings(env);
  const svc = (s.apis || {})[name];
  if (!svc || !svc.enabled || !svc.endpoint) return json({ error: 'This service is not available right now.' }, 404);

  if (!(await rateLimit(env, `px:${name}:${clientIP(request)}`, svc.rateLimit || 30, 60))) return json({ error: 'Too many requests. Please slow down.' }, 429);

  const len = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (len > MAX_BODY) return json({ error: 'File too large' }, 413);

  const target = new URL(svc.endpoint);
  const headers = new Headers(svc.headers || {});
  const ct = request.headers.get('Content-Type'); if (ct) headers.set('Content-Type', ct);
  if (svc.key && svc.authType === 'bearer') headers.set(svc.authName || 'Authorization', (svc.authPrefix ?? 'Bearer ') + svc.key);
  else if (svc.key && svc.authType === 'header') headers.set(svc.authName || 'X-Api-Key', (svc.authPrefix || '') + svc.key);
  else if (svc.key && svc.authType === 'query') target.searchParams.set(svc.authName || 'key', svc.key);

  const incoming = new URL(request.url);
  incoming.searchParams.forEach((v, k) => { if (k !== (svc.authName || 'key')) target.searchParams.set(k, v); });

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: svc.method === 'GET' ? 'GET' : 'POST',
      headers, body: svc.method === 'GET' ? undefined : request.body,
    });
  } catch { return json({ error: 'The upstream service did not respond.' }, 502); }

  const out = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  const uct = upstream.headers.get('Content-Type'); if (uct) out.set('Content-Type', uct);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
