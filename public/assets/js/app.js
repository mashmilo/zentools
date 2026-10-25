/* Zentools front-end runtime. No dependencies. */
(() => {
  'use strict';
  const d = document;
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => [...r.querySelectorAll(s)];
  const body = d.body;
  const page = body.dataset.page;
  const slug = body.dataset.tool || '';
  const isMobile = () => matchMedia('(max-width:720px)').matches;

  /* ---------- public API for tools ---------- */
  const Z = (window.Zentools = window.Zentools || {});
  Z.tools = {};
  Z.register = (s, def) => { Z.tools[s] = def; };

  const scriptCache = {};
  const util = {
    $, $$,
    fmtBytes(n) {
      if (!isFinite(n)) return '';
      const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
      while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
      return n.toFixed(n < 10 && i ? 2 : n < 100 && i ? 1 : 0) + ' ' + u[i];
    },
    debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    download(blobOrText, name, type = 'application/octet-stream') {
      const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
      const a = d.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; d.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
    async copy(text) {
      try { await navigator.clipboard.writeText(text); util.toast('Copied'); }
      catch { util.toast('Copy failed'); }
    },
    toast(msg, ms = 1800) {
      const t = d.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
      d.body.appendChild(t); setTimeout(() => t.remove(), ms);
    },
    readFile(file, as = 'arrayBuffer') {
      return new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error);
        r[as === 'text' ? 'readAsText' : as === 'dataURL' ? 'readAsDataURL' : 'readAsArrayBuffer'](file);
      });
    },
    // Load a heavy library only when a tool needs it (keeps pages fast). Pin versions!
    loadScript(src) {
      return scriptCache[src] || (scriptCache[src] = new Promise((res, rej) => {
        const s = d.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src)); d.head.appendChild(s);
      }));
    },
  };
  Z.util = util;

  /* ---------- theme ---------- */
  $('#theme')?.addEventListener('click', () => {
    const root = d.documentElement;
    const cur = root.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('zt-theme', next); } catch {}
  });

  /* ---------- search ---------- */
  let indexP;
  const loadIndex = () => indexP || (indexP = fetch('/tools.json').then((r) => r.json()).catch(() => []));
  const match = (t, words) => {
    const n = t.n.toLowerCase(); let s = 0;
    for (const w of words) {
      if (n.startsWith(w)) s += 6; else if (n.includes(w)) s += 4; else if (t.k.includes(w)) s += 2; else if (t.d.toLowerCase().includes(w)) s += 1; else return 0;
    }
    return s;
  };
  const q = $('#q'), box = $('#results');
  if (q && box) {
    let sel = -1;
    const render = async () => {
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) { box.hidden = true; return; }
      const idx = await loadIndex();
      const hits = idx.map((t) => [match(t, words), t]).filter((x) => x[0]).sort((a, b) => b[0] - a[0]).slice(0, 8);
      sel = -1;
      box.innerHTML = hits.length
        ? hits.map(([, t], i) => `<li role="option" id="r${i}"><a href="/${t.s}/">${esc(t.n)}<small>${esc(t.d)}</small></a></li>`).join('')
        : '<li class="muted" style="padding:8px 10px">No matching tools</li>';
      box.hidden = false;
    };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    q.addEventListener('input', util.debounce(render, 80));
    q.addEventListener('focus', () => { loadIndex(); if (q.value) render(); });
    q.addEventListener('keydown', (ev) => {
      const items = $$('li[role=option]', box);
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        if (!items.length) return; ev.preventDefault();
        sel = (sel + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((li, i) => li.setAttribute('aria-selected', i === sel));
      } else if (ev.key === 'Enter' && sel >= 0) { ev.preventDefault(); location.href = $('a', items[sel]).href; }
      else if (ev.key === 'Escape') box.hidden = true;
    });
    d.addEventListener('click', (ev) => { if (!ev.target.closest('.search')) box.hidden = true; });
    d.addEventListener('keydown', (ev) => { if (ev.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(d.activeElement.tagName) && !d.activeElement.isContentEditable) { ev.preventDefault(); q.focus(); } });
  }
  // /tools/ filter
  const filter = $('#tools-filter');
  if (filter) {
    const apply = () => {
      const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
      let any = false;
      $$('.tool-group').forEach((g) => {
        let vis = 0;
        $$('li', g).forEach((li) => { const ok = words.every((w) => li.textContent.toLowerCase().includes(w)); li.hidden = !ok; if (ok) vis++; });
        g.hidden = !vis; if (vis) any = true;
      });
      const nm = $('#no-match'); if (nm) nm.hidden = any;
    };
    filter.addEventListener('input', apply);
    const initial = new URLSearchParams(location.search).get('q');
    if (initial) { filter.value = initial; apply(); }
  }

  /* ---------- config (ads, analytics, per-tool switches) ---------- */
  const fetchConfig = () => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    return fetch('/api/config', { signal: ctl.signal, credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : {})).catch(() => ({})).finally(() => clearTimeout(t));
  };
  const configP = fetchConfig();

  function injectHTML(html, target) {
    const t = d.createElement('template'); t.innerHTML = html;
    [...t.content.childNodes].forEach((n) => {
      if (n.nodeName === 'SCRIPT') {
        const s = d.createElement('script');
        [...n.attributes].forEach((a) => s.setAttribute(a.name, a.value));
        s.text = n.textContent; target.appendChild(s);
      } else target.appendChild(n);
    });
  }

  const deviceOK = (dev) => !dev || dev === 'all' || (dev === 'mobile') === isMobile();

  function renderSlot(el, s, nets) {
    const mobile = isMobile();
    const w = mobile ? s.mw : s.w, h = mobile ? s.mh : s.h;
    const codes = nets.filter((n) => s[n] && s[n].trim());
    if (!codes.length) return false;
    el.hidden = false; el.textContent = '';
    if (h) el.style.minHeight = h + 'px';
    codes.forEach((n) => {
      const wrap = d.createElement('div');
      if (s.render === 'direct') { injectHTML(s[n], wrap); }
      else {
        const f = d.createElement('iframe');
        f.title = 'Advertisement'; f.loading = 'lazy'; f.width = w || 300; f.height = h || 250;
        f.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation');
        f.srcdoc = '<!doctype html><html><head><base target="_blank"></head><body style="margin:0;display:flex;justify-content:center;background:transparent">' + s[n] + '</body></html>';
        wrap.appendChild(f);
      }
      el.appendChild(wrap);
    });
    return true;
  }

  function runAds(cfg) {
    const ads = cfg.ads;
    if (!ads || !ads.enabled || ads.mode === 'none') return;
    const ov = (cfg.tools && cfg.tools[slug]) || {};
    if (ov.ads === false) return;
    const pageKey = page === 'tool' ? 'tool' : page === 'content' ? 'content' : 'listing';
    if (ads.pages && ads.pages[pageKey] === false) return;
    const modeNets = ads.mode === 'adsterra' ? ['adsterra'] : ads.mode === 'monetag' ? ['monetag'] : ['adsterra', 'monetag'];

    $$('[data-ad-slot]').forEach((el) => {
      const name = el.dataset.adSlot, s = ads.slots && ads.slots[name];
      if (!s || !s.enabled || !deviceOK(s.devices)) return;
      if (ov.slots && ov.slots[name] === false) return;
      let nets = modeNets.filter((n) => s[n] && s[n].trim());
      if (s.network === 'adsterra' || s.network === 'monetag') nets = nets.filter((n) => n === s.network).length ? nets.filter((n) => n === s.network) : nets;
      else if (s.network === 'rotate' && nets.length > 1) nets = [nets[Math.floor(Math.random() * nets.length)]];
      if (!nets.length) return;
      const go = () => {
        if (el.dataset.done) return; el.dataset.done = '1';
        if (renderSlot(el, s, nets)) {
          if (ads.label !== false) { const l = d.createElement('span'); l.className = 'ad-label'; l.textContent = 'Advertisement'; el.prepend(l); }
          if (name === 'sticky') { const x = d.createElement('button'); x.className = 'ad-close'; x.type = 'button'; x.textContent = 'Close'; x.onclick = () => el.remove(); el.appendChild(x); }
        }
      };
      if (ads.lazy !== false && 'IntersectionObserver' in window && name !== 'sticky') {
        el.style.minHeight = ((isMobile() ? s.mh : s.h) || 90) + 'px'; el.hidden = false;
        const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); go(); } }, { rootMargin: '300px' });
        io.observe(el);
      } else go();
    });

    // page-level scripts: popunder, social bar, push, vignette...
    if (ov.popunder === false) return;
    modeNets.forEach((n) => {
      const g = ads.global && ads.global[n];
      if (!g || !g.enabled || !g.code || !deviceOK(g.devices)) return;
      setTimeout(() => injectHTML(g.code, g.placement === 'head' ? d.head : d.body), Math.max(0, (g.delay || 0) * 1000));
    });
  }

  function runAnalytics(cfg) {
    const s = cfg.site || {};
    if (s.gaId && /^[A-Z0-9-]{4,20}$/i.test(s.gaId)) {
      const a = d.createElement('script'); a.async = true; a.src = 'https://www.googletagmanager.com/gtag/js?id=' + s.gaId; d.head.appendChild(a);
      window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); };
      gtag('js', new Date()); gtag('config', s.gaId);
    }
    if (s.cfBeacon && /^[a-f0-9]{16,64}$/i.test(s.cfBeacon)) {
      const b = d.createElement('script'); b.defer = true; b.src = 'https://static.cloudflareinsights.com/beacon.min.js';
      b.setAttribute('data-cf-beacon', JSON.stringify({ token: s.cfBeacon })); d.head.appendChild(b);
    }
    if (s.headHtml) injectHTML(s.headHtml, d.head);
    if (s.footerHtml) injectHTML(s.footerHtml, d.body);
  }

  function announcement(cfg) {
    const a = cfg.site && cfg.site.announcement, el = $('#announce');
    if (!a || !a.enabled || !a.text || !el) return;
    try { if (localStorage.getItem('zt-ann') === a.text) return; } catch {}
    el.textContent = a.text + ' ';
    if (a.link && /^(\/|https:\/\/)/.test(a.link)) { const l = d.createElement('a'); l.href = a.link; l.textContent = 'Learn more'; el.appendChild(l); }
    el.hidden = false;
  }

  function consentFlow(cfg, done) {
    const c = cfg.consent;
    if (!c || !c.required) return done();
    let v; try { v = localStorage.getItem('zt-consent'); } catch {}
    if (v === 'yes') return done();
    if (v === 'no') return;
    const b = d.createElement('div'); b.className = 'consent'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookie consent');
    b.innerHTML = '<p></p><div class="row"><button class="btn" type="button" data-v="no">Decline</button><button class="btn btn-primary" type="button" data-v="yes">Accept</button></div>';
    $('p', b).textContent = c.text || 'We use cookies for analytics and to show ads. You can accept or decline.';
    b.addEventListener('click', (ev) => {
      const v2 = ev.target.dataset && ev.target.dataset.v; if (!v2) return;
      try { localStorage.setItem('zt-consent', v2); } catch {}
      b.remove(); if (v2 === 'yes') done();
    });
    d.body.appendChild(b);
  }

  /* ---------- tool runtime ---------- */
  if (page === 'tool') {
    const root = $('#tool-root');
    const ctx = {
      slug, util, root,
      config: () => configP,
      // Call an API configured in the admin panel. The key never reaches the browser.
      async api(service, payload, opts = {}) {
        const isForm = payload instanceof FormData || payload instanceof Blob || typeof payload === 'string';
        return fetch('/api/proxy/' + encodeURIComponent(service) + (opts.query ? '?' + new URLSearchParams(opts.query) : ''), {
          method: 'POST',
          headers: Object.assign(isForm || payload == null ? {} : { 'Content-Type': 'application/json' }, opts.headers || {}),
          body: payload == null ? undefined : isForm ? payload : JSON.stringify(payload),
          signal: opts.signal,
        });
      },
    };
    const mount = () => {
      const def = Z.tools[slug];
      root.classList.remove('is-loading'); root.textContent = '';
      if (!def) { root.innerHTML = '<p class="zt-error">This tool failed to load. Please refresh the page.</p>'; return; }
      try { def.mount(root, ctx); }
      catch (err) { console.error(err); root.innerHTML = '<p class="zt-error">Something went wrong while starting this tool. Please refresh the page.</p>'; }
    };
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', mount); else mount();
    configP.then((cfg) => {
      const ov = (cfg.tools && cfg.tools[slug]) || {};
      if (ov.disabled) root.innerHTML = '<p><strong>This tool is temporarily unavailable.</strong> Please try again later or <a href="/tools/">browse other tools</a>.</p>';
    });
  }

  configP.then((cfg) => {
    announcement(cfg);
    consentFlow(cfg, () => { runAnalytics(cfg); runAds(cfg); });
  });
})();
