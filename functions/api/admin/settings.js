import { json, requireAdmin } from '../../_lib/auth.js';
import { DEFAULTS, merge, loadSettings } from '../../_lib/defaults.js';

const MASK = '••••';
const maskKey = (k) => (k ? MASK + String(k).slice(-4) : '');
const SERVICE = /^[a-z0-9_-]{1,40}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function onRequestGet({ request, env }) {
  const a = await requireAdmin(request, env); if (a.res) return a.res;
  const s = await loadSettings(env);
  for (const svc of Object.values(s.apis || {})) svc.key = maskKey(svc.key);
  return json(s);
}

export async function onRequestPut({ request, env }) {
  const a = await requireAdmin(request, env); if (a.res) return a.res;
  const text = await request.text();
  if (text.length > 600000) return json({ error: 'Settings too large' }, 413);
  let inc; try { inc = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const prev = await loadSettings(env);

  // Only accept known top-level sections; merge onto defaults so shape stays valid.
  const next = merge(DEFAULTS, {
    site: inc.site, consent: inc.consent, ads: inc.ads, adsTxt: typeof inc.adsTxt === 'string' ? inc.adsTxt.slice(0, 20000) : '',
  });
  if (!['adsterra', 'monetag', 'both', 'none'].includes(next.ads.mode)) next.ads.mode = 'both';

  next.apis = {};
  for (const [name, svc] of Object.entries(inc.apis || {})) {
    if (!SERVICE.test(name) || typeof svc !== 'object' || !svc) continue;
    const old = (prev.apis || {})[name] || {};
    const endpoint = String(svc.endpoint || '').trim();
    if (endpoint && !/^https:\/\//i.test(endpoint)) return json({ error: `API "${name}": endpoint must start with https://` }, 400);
    let headers = {};
    if (svc.headers && typeof svc.headers === 'object') for (const [k, v] of Object.entries(svc.headers)) if (/^[A-Za-z0-9-]{1,60}$/.test(k)) headers[k] = String(v).slice(0, 500);
    next.apis[name] = {
      label: String(svc.label || name).slice(0, 80),
      enabled: !!svc.enabled,
      endpoint,
      method: ['GET', 'POST'].includes(svc.method) ? svc.method : 'POST',
      authType: ['bearer', 'header', 'query', 'none'].includes(svc.authType) ? svc.authType : 'bearer',
      authName: String(svc.authName || '').slice(0, 60),
      authPrefix: String(svc.authPrefix ?? '').slice(0, 30),
      key: typeof svc.key === 'string' && svc.key.startsWith(MASK) ? old.key || '' : String(svc.key || '').slice(0, 2000),
      headers,
      rateLimit: Math.min(Math.max(parseInt(svc.rateLimit, 10) || 30, 1), 600),
      note: String(svc.note || '').slice(0, 300),
    };
  }

  next.tools = {};
  for (const [slug, t] of Object.entries(inc.tools || {})) {
    if (!SLUG.test(slug) || typeof t !== 'object' || !t) continue;
    const o = {};
    if (t.disabled) o.disabled = true;
    if (t.ads === false) o.ads = false;
    if (t.popunder === false) o.popunder = false;
    if (t.slots && typeof t.slots === 'object') {
      o.slots = {};
      for (const sl of Object.keys(DEFAULTS.ads.slots)) if (t.slots[sl] === false) o.slots[sl] = false;
      if (!Object.keys(o.slots).length) delete o.slots;
    }
    if (Object.keys(o).length) next.tools[slug] = o;
  }

  next.updatedAt = Date.now();
  await env.ZT_KV.put('settings_prev', JSON.stringify(prev));
  await env.ZT_KV.put('settings', JSON.stringify(next));
  const out = structuredClone(next);
  for (const svc of Object.values(out.apis)) svc.key = maskKey(svc.key);
  return json(out);
}
