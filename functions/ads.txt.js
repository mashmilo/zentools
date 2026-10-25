// Serves /ads.txt from the admin panel (Site tab). Static public/ads.txt must not exist.
import { loadSettings } from './_lib/defaults.js';

export async function onRequestGet({ env }) {
  const s = await loadSettings(env);
  return new Response((s.adsTxt || '# No ads.txt entries configured yet\n').trim() + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
