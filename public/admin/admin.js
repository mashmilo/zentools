(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let S = null;          // settings being edited
  let TOOLS = [];        // from /tools.json
  let dirty = false;

  const api = async (path, opt = {}) => {
    const r = await fetch(path, { credentials: 'same-origin', ...opt, headers: { 'X-ZT': '1', ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) } });
    let data = null; try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  };

  /* ---- path helpers ---- */
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const set = (o, p, v) => { const ks = p.split('.'); let c = o; ks.slice(0, -1).forEach((k) => { if (typeof c[k] !== 'object' || c[k] === null) c[k] = {}; c = c[k]; }); c[ks[ks.length - 1]] = v; };
  const del = (o, p) => { const ks = p.split('.'); let c = o; for (const k of ks.slice(0, -1)) { c = c && c[k]; if (!c) return; } delete c[ks[ks.length - 1]]; };

  function markDirty() { dirty = true; const s = $('#state'); s.textContent = 'Unsaved changes'; s.className = 'state dirty'; }
  function markClean() { dirty = false; const s = $('#state'); s.textContent = 'Saved'; s.className = 'state'; }

  function bind(root) {
    $$('[data-path]', root).forEach((el) => {
      const p = el.dataset.path, v = get(S, p), tri = el.dataset.kind === 'tri';
      if (el.type === 'checkbox') el.checked = !!v;
      else if (tri) el.value = v === false ? 'off' : '';
      else el.value = v ?? '';
      el.oninput = el.onchange = () => {
        if (tri) { if (el.value === 'off') set(S, p, false); else del(S, p); }
        else if (el.dataset.kind === 'off-on-uncheck') { if (el.checked) del(S, p); else set(S, p, false); }
        else set(S, p, el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value);
        markDirty();
      };
    });
  }
  // "enabled" checkboxes on the tool table are stored inverted (disabled flag)
  function bindInverse(el, p) {
    el.checked = !get(S, p); el.onchange = () => { if (el.checked) del(S, p); else set(S, p, true); markDirty(); };
  }

  /* ---- ads UI ---- */
  const SLOT_INFO = {
    top: 'Top (above the tool)', inline: 'Inline (below the tool)', sidebar: 'Sidebar (desktop)', bottom: 'Bottom (end of page)', sticky: 'Sticky footer (mobile)',
  };
  function renderAds() {
    $('#globals').innerHTML = ['adsterra', 'monetag'].map((n) => `
      <div class="slot"><h3>${n === 'adsterra' ? 'Adsterra' : 'Monetag'} page script</h3>
      <label class="chk"><input type="checkbox" data-path="ads.global.${n}.enabled"> Enabled</label>
      <label>Script code<textarea rows="3" data-path="ads.global.${n}.code" spellcheck="false" placeholder="&lt;script src=&quot;...&quot;&gt;&lt;/script&gt;"></textarea></label>
      <div class="grid2">
        <label>Placement<select data-path="ads.global.${n}.placement"><option value="body">End of body</option><option value="head">Head</option></select></label>
        <label>Devices<select data-path="ads.global.${n}.devices"><option value="all">All</option><option value="desktop">Desktop only</option><option value="mobile">Mobile only</option></select></label>
        <label>Delay (seconds)<input type="number" min="0" max="60" data-path="ads.global.${n}.delay"></label>
      </div></div>`).join('');
    $('#slots').innerHTML = Object.keys(SLOT_INFO).map((k) => `
      <div class="panel"><h2>${SLOT_INFO[k]}</h2>
      <div class="grid2">
        <label class="chk"><input type="checkbox" data-path="ads.slots.${k}.enabled"> Enabled</label>
        <label>Network<select data-path="ads.slots.${k}.network"><option value="rotate">Rotate Adsterra / Monetag</option><option value="adsterra">Adsterra</option><option value="monetag">Monetag</option><option value="both">Show both</option></select></label>
        <label>Devices<select data-path="ads.slots.${k}.devices"><option value="all">All</option><option value="desktop">Desktop only</option><option value="mobile">Mobile only</option></select></label>
        <label>Render mode<select data-path="ads.slots.${k}.render"><option value="iframe">Isolated (recommended)</option><option value="direct">Direct (if a network fails in isolation)</option></select></label>
        <label>Desktop width x height<span class="row"><input type="number" data-path="ads.slots.${k}.w"><input type="number" data-path="ads.slots.${k}.h"></span></label>
        <label>Mobile width x height<span class="row"><input type="number" data-path="ads.slots.${k}.mw"><input type="number" data-path="ads.slots.${k}.mh"></span></label>
      </div>
      <label>Adsterra code<textarea rows="3" data-path="ads.slots.${k}.adsterra" spellcheck="false"></textarea></label>
      <label>Monetag code<textarea rows="3" data-path="ads.slots.${k}.monetag" spellcheck="false"></textarea></label></div>`).join('');
    bind($('#tab-ads'));
  }

  /* ---- tools table ---- */
  function renderTools() {
    const f = ($('#tool-filter').value || '').toLowerCase();
    const rows = TOOLS.filter((t) => !f || t.n.toLowerCase().includes(f) || t.s.includes(f));
    $('#tool-empty').hidden = TOOLS.length > 0;
    $('#tool-table tbody').innerHTML = rows.map((t) => {
      const base = `tools.${t.s}`;
      const tri = (k) => `<td><select data-kind="tri" data-path="${base}.slots.${k}"><option value="">Default</option><option value="off">Off</option></select></td>`;
      return `<tr><td><a href="/${esc(t.s)}/" target="_blank" rel="noopener">${esc(t.n)}</a></td>
      <td><input type="checkbox" data-inv="${base}.disabled" aria-label="Enabled"></td>
      <td><select data-kind="tri" data-path="${base}.ads"><option value="">Default</option><option value="off">Off</option></select></td>
      <td><select data-kind="tri" data-path="${base}.popunder"><option value="">Default</option><option value="off">Off</option></select></td>
      ${['top', 'inline', 'sidebar', 'bottom', 'sticky'].map(tri).join('')}</tr>`;
    }).join('');
    $$('[data-inv]', $('#tool-table')).forEach((el) => bindInverse(el, el.dataset.inv));
    bind($('#tool-table'));
  }

  /* ---- API services ---- */
  function renderApis() {
    const declared = {};
    TOOLS.forEach((t) => (t.a || []).forEach((n) => (declared[n] = declared[n] || []).push(t.n)));
    Object.keys(declared).forEach((n) => { if (!S.apis[n]) S.apis[n] = { label: n, enabled: false, endpoint: '', method: 'POST', authType: 'bearer', authName: '', authPrefix: 'Bearer ', key: '', headers: {}, rateLimit: 30, note: '' }; });
    const names = Object.keys(S.apis);
    $('#api-list').innerHTML = names.length ? names.map((n) => `
      <div class="slot"><h3>${esc(S.apis[n].label || n)} <code>${esc(n)}</code>${declared[n] ? `<span class="badge">Used by ${esc(declared[n].slice(0, 3).join(', '))}${declared[n].length > 3 ? '…' : ''}</span>` : ''}</h3>
      <label class="chk"><input type="checkbox" data-path="apis.${n}.enabled"> Enabled</label>
      <div class="grid2">
        <label>Label<input data-path="apis.${n}.label"></label>
        <label>Endpoint URL (https)<input data-path="apis.${n}.endpoint" placeholder="https://api.example.com/v1/endpoint"></label>
        <label>API key<input type="password" autocomplete="off" data-path="apis.${n}.key" placeholder="Paste key"></label>
        <label>Method<select data-path="apis.${n}.method"><option>POST</option><option>GET</option></select></label>
        <label>Key is sent as<select data-path="apis.${n}.authType"><option value="bearer">Authorization header (Bearer)</option><option value="header">Custom header</option><option value="query">URL parameter</option><option value="none">No key</option></select></label>
        <label>Header / parameter name<input data-path="apis.${n}.authName" placeholder="X-Api-Key or api_key"></label>
        <label>Value prefix<input data-path="apis.${n}.authPrefix" placeholder="Bearer "></label>
        <label>Requests per minute per visitor<input type="number" min="1" max="600" data-path="apis.${n}.rateLimit"></label>
      </div>
      <label>Notes<input data-path="apis.${n}.note" placeholder="Plan, renewal date, dashboard link"></label>
      <button class="btn sm" type="button" data-remove-api="${esc(n)}">Remove service</button></div>`).join('') : '<p class="hint">No services yet. Add one below, or declare "apis" in a tool\'s meta.json.</p>';
    bind($('#api-list'));
    $$('[data-remove-api]').forEach((b) => (b.onclick = () => { if (confirm('Remove this service and its key?')) { delete S.apis[b.dataset.removeApi]; markDirty(); renderApis(); } }));
  }

  /* ---- load / save ---- */
  async function loadAll() {
    const r = await api('/api/admin/settings');
    if (r.status === 401) return showLogin();
    if (!r.ok) { alert((r.data && r.data.error) || 'Could not load settings'); return; }
    S = r.data;
    try { TOOLS = await (await fetch('/tools.json', { cache: 'no-store' })).json(); } catch { TOOLS = []; }
    $('#login').hidden = true; $('#app').hidden = false;
    renderAds(); renderTools(); renderApis(); bind($('#tab-site')); markClean();
  }
  async function save() {
    const b = $('#save'); b.disabled = true; b.textContent = 'Saving…';
    const r = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(S) });
    b.disabled = false; b.textContent = 'Save changes';
    if (r.status === 401) return showLogin();
    if (!r.ok) { alert((r.data && r.data.error) || 'Save failed'); return; }
    S = r.data; renderAds(); renderTools(); renderApis(); bind($('#tab-site')); markClean();
  }
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#lu').focus(); }

  /* ---- events ---- */
  $('#login-form').onsubmit = async (ev) => {
    ev.preventDefault(); $('#login-err').textContent = '';
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: $('#lu').value, password: $('#lp').value }) });
    if (r.ok) { $('#lp').value = ''; loadAll(); } else $('#login-err').textContent = (r.data && r.data.error) || 'Sign-in failed';
  };
  $('#save').onclick = save;
  $('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST', body: '{}' }); S = null; showLogin(); };
  $('#logout-all').onclick = async () => { await api('/api/admin/logout', { method: 'POST', body: JSON.stringify({ all: true }) }); S = null; showLogin(); };
  $('#tabs').onclick = (ev) => {
    const t = ev.target.dataset && ev.target.dataset.tab; if (!t) return;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b === ev.target));
    $$('.tab').forEach((s) => (s.hidden = s.id !== 'tab-' + t));
  };
  $('#tool-filter').oninput = renderTools;
  $('#add-api').onclick = () => {
    const n = $('#new-api').value.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,40}$/.test(n)) return alert('Use lowercase letters, numbers, - and _ (max 40).');
    if (S.apis[n]) return alert('That service already exists.');
    S.apis[n] = { label: n, enabled: false, endpoint: '', method: 'POST', authType: 'bearer', authName: '', authPrefix: 'Bearer ', key: '', headers: {}, rateLimit: 30, note: '' };
    $('#new-api').value = ''; markDirty(); renderApis();
  };
  $('#export').onclick = () => {
    const copy = JSON.parse(JSON.stringify(S)); Object.values(copy.apis || {}).forEach((a) => (a.key = ''));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }));
    a.download = 'zentools-settings-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  };
  $('#import').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const inc = JSON.parse(await f.text());
      Object.values(inc.apis || {}).forEach((a) => { a.key = ''; });
      for (const [n, a] of Object.entries(inc.apis || {})) if (S.apis[n]) a.key = S.apis[n].key;
      S = Object.assign(S, inc); markDirty(); renderAds(); renderTools(); renderApis(); bind($('#tab-site'));
      alert('Imported. Review it, then press Save changes.');
    } catch { alert('That file is not valid settings JSON.'); }
    ev.target.value = '';
  };
  window.addEventListener('beforeunload', (ev) => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });

  (async () => {
    const r = await api('/api/admin/session');
    if (r.ok && r.data && r.data.authenticated) loadAll();
    else { showLogin(); if (r.data && r.data.configured === false) $('#login-err').textContent = 'Admin is not configured yet. Set the environment variables in Cloudflare (see README).'; if (r.status === 503) $('#login-err').textContent = (r.data && r.data.error) || 'Backend not ready.'; }
  })();
})();
