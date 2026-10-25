// Public configuration for the front-end. Never returns API keys.
import { loadSettings } from '../_lib/defaults.js';

export async function onRequestGet({ env }) {
  const s = await loadSettings(env);
  const tools = {};
  for (const [slug, t] of Object.entries(s.tools || {})) {
    const o = {};
    if (t.disabled) o.disabled = true;
    if (t.ads === false) o.ads = false;
    if (t.popunder === false) o.popunder = false;
    if (t.slots && Object.keys(t.slots).length) o.slots = t.slots;
    if (Object.keys(o).length) tools[slug] = o;
  }
  const apis = {};
  for (const [name, a] of Object.entries(s.apis || {})) apis[name] = !!(a.enabled && a.endpoint);
  return new Response(JSON.stringify({ site: s.site, consent: s.consent, ads: s.ads, tools, apis }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30, s-maxage=60' },
  });
}
