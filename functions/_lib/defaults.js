// Default settings. Stored settings are deep-merged on top of these.
const slot = (w, h, mw, mh, devices = 'all') => ({ enabled: false, network: 'rotate', adsterra: '', monetag: '', w, h, mw, mh, devices, render: 'iframe' });
const glob = () => ({ enabled: false, code: '', placement: 'body', devices: 'all', delay: 0 });

export const DEFAULTS = {
  site: { gaId: '', cfBeacon: '', announcement: { enabled: false, text: '', link: '' }, headHtml: '', footerHtml: '' },
  consent: { required: false, text: 'We use cookies for analytics and to show ads. You can accept or decline.' },
  ads: {
    enabled: false,
    mode: 'both', // adsterra | monetag | both | none
    label: true,
    lazy: true,
    pages: { tool: true, listing: true, content: false },
    slots: {
      top: slot(728, 90, 320, 50),
      inline: slot(300, 250, 300, 250),
      sidebar: slot(300, 250, 300, 250, 'desktop'),
      bottom: slot(728, 90, 320, 50),
      sticky: slot(320, 50, 320, 50, 'mobile'),
    },
    global: { adsterra: glob(), monetag: glob() },
  },
  apis: {},   // service -> { label, enabled, endpoint, method, authType, authName, authPrefix, key, headers, rateLimit, note }
  tools: {},  // slug -> { disabled, ads, slots: {top:false}, popunder }
  adsTxt: '',
  updatedAt: 0,
};

export function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = k in base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) && typeof over[k] === 'object' && over[k] !== null
      ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

export async function loadSettings(env) {
  if (!env.ZT_KV) return structuredClone(DEFAULTS);
  const raw = await env.ZT_KV.get('settings', 'json');
  return merge(DEFAULTS, raw || {});
}
