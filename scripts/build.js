#!/usr/bin/env node
'use strict';
/**
 * Zentools build script (zero dependencies).
 * Reads tools/<slug>/{meta.json,tool.js,tool.css,content.html} and generates a fully
 * static, SEO-ready site in ./dist (pages, sitemap, robots, manifest, search index).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const cfg = readJSON('site.config.json');
const CATS = readJSON('categories.json');
const CAT = Object.fromEntries(CATS.map((c) => [c.slug, c]));
const BASE = cfg.url.replace(/\/$/, '');
const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = new Date().getFullYear();
const RESERVED = new Set(['admin', 'api', 'assets', 'tools', 'category', 'about', 'contact', 'privacy-policy', 'terms', 'search', 'sitemap', 'robots', 'favicon', '404', 'ads']);

const e = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const write = (rel, data) => {
  const p = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
};
const exists = (p) => fs.existsSync(p);
const warn = (m) => console.warn('  ! ' + m);
const fail = (m) => { console.error('\nBUILD ERROR: ' + m + '\n'); process.exit(1); };

/* ---------- 1. clean + copy static files ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });

const fileHash = (...files) => {
  const h = crypto.createHash('md5');
  files.forEach((f) => h.update(fs.readFileSync(f)));
  return h.digest('hex').slice(0, 8);
};
const V = fileHash(path.join(DIST, 'assets/css/main.css'), path.join(DIST, 'assets/js/app.js'));

/* ---------- 2. load tools ---------- */
function loadTools() {
  const dir = path.join(ROOT, 'tools');
  const out = [];
  const drafts = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const d = path.join(dir, name);
    if (!fs.statSync(d).isDirectory()) continue;
    const mp = path.join(d, 'meta.json');
    if (!exists(mp)) { warn(`tools/${name}: no meta.json, skipped`); continue; }
    let m;
    try { m = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch (err) { fail(`tools/${name}/meta.json is not valid JSON: ${err.message}`); }
    m.slug = m.slug || name;
    if (m.slug !== name) fail(`tools/${name}: "slug" must match the folder name`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.slug)) fail(`tools/${name}: slug must be lowercase letters, numbers, hyphens`);
    if (RESERVED.has(m.slug)) fail(`tools/${name}: "${m.slug}" is a reserved URL`);
    const hasJs = exists(path.join(d, 'tool.js'));
    const status = m.status || (hasJs ? 'live' : 'draft');
    if (status !== 'live') { drafts.push(m.slug); continue; }
    if (!hasJs) fail(`tools/${name}: status is live but tool.js is missing`);
    if (!CAT[m.category]) fail(`tools/${name}: unknown category "${m.category}"`);
    if (!m.name || !m.description) fail(`tools/${name}: "name" and "description" are required`);
    if (m.description.length < 70 || m.description.length > 165) warn(`${m.slug}: description is ${m.description.length} chars (aim for 120-160)`);
    m.keywords = m.keywords || [];
    m.faq = (m.faq || []).filter((f) => f.q && f.a);
    m.howto = m.howto || [];
    m.apis = m.apis || [];
    m.updated = m.updated || TODAY;
    m.tagline = m.tagline || m.description;
    m.dir = d;
    m.hasCss = exists(path.join(d, 'tool.css'));
    m.content = exists(path.join(d, 'content.html')) ? fs.readFileSync(path.join(d, 'content.html'), 'utf8') : '';
    if (!m.content) warn(`${m.slug}: no content.html (add 150+ words of copy for better ranking)`);
    out.push(m);
  }
  out.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
  return { tools: out, drafts };
}
const { tools: TOOLS, drafts: DRAFTS } = loadTools();
const BY_CAT = {};
TOOLS.forEach((t) => (BY_CAT[t.category] = BY_CAT[t.category] || []).push(t));
const LIVE_CATS = CATS.filter((c) => BY_CAT[c.slug]);

/* ---------- 3. shared HTML ---------- */
const url = (p) => BASE + p;
const hasMail = !!cfg.email;

function adSlot(name) { return `<div class="ad" data-ad-slot="${name}" hidden></div>`; }

function layout(o) {
  const canonical = url(o.path);
  const img = url(o.image || cfg.ogImage);
  const robots = o.noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
  const bodyData = Object.entries(o.data || {}).map(([k, v]) => ` data-${k}="${e(v)}"`).join('');
  const catLinks = LIVE_CATS.map((c) => `<li><a href="/category/${c.slug}/">${e(c.name)}</a></li>`).join('');
  return `<!doctype html>
<html lang="${cfg.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(o.title)}</title>
<meta name="description" content="${e(o.description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="${cfg.themeColor}">
<meta name="application-name" content="${e(cfg.name)}">
${cfg.verification.google ? `<meta name="google-site-verification" content="${e(cfg.verification.google)}">` : ''}
${cfg.verification.bing ? `<meta name="msvalidate.01" content="${e(cfg.verification.bing)}">` : ''}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="48x48" href="/assets/img/favicon-48.png">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/img/icon-192.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:site_name" content="${e(cfg.name)}">
<meta property="og:title" content="${e(o.title)}">
<meta property="og:description" content="${e(o.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${cfg.locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(o.title)}">
<meta name="twitter:description" content="${e(o.description)}">
<meta name="twitter:image" content="${img}">
${cfg.twitter ? `<meta name="twitter:site" content="@${e(cfg.twitter.replace(/^@/, ''))}">` : ''}
<script>try{var t=localStorage.getItem('zt-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="stylesheet" href="/assets/css/main.css?v=${V}">
${o.head || ''}
${(o.jsonld || []).map(ld).join('\n')}
</head>
<body data-page="${o.type}"${bodyData}>
<a class="skip" href="#main">Skip to content</a>
<div id="announce" class="announce" hidden></div>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="/"><img src="/assets/img/logo-72.png" width="36" height="36" alt=""><span>${e(cfg.name)}</span></a>
    <form class="search" role="search" action="/tools/" autocomplete="off">
      <input id="q" name="q" type="search" placeholder="Search tools" aria-label="Search tools" aria-controls="results" aria-autocomplete="list">
      <ul class="results" id="results" role="listbox" hidden></ul>
    </form>
    <nav class="nav" aria-label="Main">
      <a href="/tools/">All tools</a>
      <button id="theme" class="icon-btn" type="button" aria-label="Switch colour theme"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
    </nav>
  </div>
  <div class="ruler" aria-hidden="true"></div>
</header>
<main id="main">
${o.body}
</main>
<footer class="site-footer">
  <div class="ruler flip" aria-hidden="true"></div>
  <div class="wrap foot-grid">
    <div>
      <a class="brand" href="/"><img src="/assets/img/logo-72.png" width="36" height="36" alt=""><span>${e(cfg.name)}</span></a>
      <p class="muted">${e(cfg.tagline)}.</p>
    </div>
    ${catLinks ? `<nav aria-label="Categories"><h2 class="foot-h">Categories</h2><ul>${catLinks}</ul></nav>` : ''}
    <nav aria-label="Company"><h2 class="foot-h">${e(cfg.name)}</h2><ul>
      <li><a href="/tools/">All tools</a></li><li><a href="/about/">About</a></li><li><a href="/contact/">Contact</a></li>
      <li><a href="/privacy-policy/">Privacy policy</a></li><li><a href="/terms/">Terms of use</a></li></ul></nav>
  </div>
  <div class="wrap fine">&copy; ${YEAR} ${e(cfg.name)}. All rights reserved.</div>
</footer>
${adSlot('sticky')}
<script src="/assets/js/app.js?v=${V}" defer></script>
${o.scripts || ''}
</body>
</html>`;
}

const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map((i, n) => n < items.length - 1 ? `<li><a href="${i.href}">${e(i.name)}</a></li>` : `<li aria-current="page">${e(i.name)}</li>`).join('')}</ol></nav>`;
const crumbLD = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((i, n) => ({ '@type': 'ListItem', position: n + 1, name: i.name, item: url(i.href) })) });
const card = (t) => `<li><a class="tcard" href="/${t.slug}/"><strong>${e(t.name)}</strong><span>${e(t.tagline)}</span></a></li>`;

/* ---------- 4. pages ---------- */
// Home
function buildHome() {
  const featured = TOOLS.filter((t) => t.featured).slice(0, 12);
  const latest = [...TOOLS].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 8);
  const catList = LIVE_CATS.map((c) => `<li><a class="cat" href="/category/${c.slug}/"><strong>${e(c.name)}</strong><span>${BY_CAT[c.slug].length} tool${BY_CAT[c.slug].length > 1 ? 's' : ''}</span></a></li>`).join('');
  const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <h1>Small jobs, done right in your browser.</h1>
      <p class="lead">Resize an image, merge a PDF, convert a unit or count some words. Every tool is free, needs no account, and is built to be fast.</p>
      <form class="hero-search" role="search" action="/tools/">
        <input name="q" type="search" placeholder="What do you need to do?" aria-label="Search tools">
        <button class="btn btn-primary" type="submit">Find a tool</button>
      </form>
    </div>
    <img class="hero-mark" src="/assets/img/logo.png" width="220" height="220" alt="Zentools logo: a ruler and a wrench forming the letter Z" fetchpriority="high">
  </div>
</section>
<div class="wrap">
  ${adSlot('top')}
  ${featured.length ? `<section><h2 class="sec-h">Popular tools</h2><ul class="grid">${featured.map(card).join('')}</ul></section>` : ''}
  ${LIVE_CATS.length ? `<section><h2 class="sec-h">Browse by category</h2><ul class="grid cats">${catList}</ul></section>` : `<section class="empty"><h2 class="sec-h">The first tools are on the way</h2><p>We are adding new tools in stages. Check back soon, or visit the <a href="/about/">about page</a> to learn what is planned.</p></section>`}
  ${latest.length && featured.length ? `<section><h2 class="sec-h">Recently updated</h2><ul class="grid">${latest.map(card).join('')}</ul></section>` : ''}
  ${adSlot('bottom')}
  <section class="prose">
    <h2>Free online tools for everyday tasks</h2>
    <p>${e(cfg.name)} brings together the small utilities people search for every day. Image and PDF tools, calculators, converters, text and developer utilities all live in one place, with a clean page for each tool and nothing to install.</p>
    <p>Where possible, tools process your files directly in your browser, so your files do not need to be uploaded to a server.</p>
  </section>
</div>`;
  write('index.html', layout({
    type: 'home', path: '/', title: `${cfg.name} – ${cfg.tagline}`, description: cfg.description, body,
    jsonld: [{
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', '@id': url('/#website'), url: url('/'), name: cfg.name, alternateName: cfg.alternateName, description: cfg.description, inLanguage: cfg.language, publisher: { '@id': url('/#org') }, potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: url('/tools/?q={search_term_string}') }, 'query-input': 'required name=search_term_string' } },
        { '@type': 'Organization', '@id': url('/#org'), name: cfg.name, url: url('/'), logo: { '@type': 'ImageObject', url: url('/assets/img/icon-512.png'), width: 512, height: 512 } },
      ],
    }],
  }));
}

// All tools
function buildToolsIndex() {
  const groups = LIVE_CATS.map((c) => `<section class="tool-group" data-cat="${c.slug}"><h2 class="sec-h"><a href="/category/${c.slug}/">${e(c.name)}</a></h2><ul class="grid">${BY_CAT[c.slug].map(card).join('')}</ul></section>`).join('');
  const items = [{ name: 'Home', href: '/' }, { name: 'All tools', href: '/tools/' }];
  const body = `<div class="wrap">${crumbs(items)}
  <h1 class="page-h">All tools</h1>
  <p class="lead">Browse every ${e(cfg.name)} tool by category.</p>
  <input id="tools-filter" class="filter" type="search" placeholder="Filter tools" aria-label="Filter tools">
  ${adSlot('top')}
  ${groups || '<p class="empty">Tools are being added. Please check back soon.</p>'}
  <p id="no-match" hidden>No tools match that search.</p>
  ${adSlot('bottom')}</div>`;
  write('tools/index.html', layout({
    type: 'listing', path: '/tools/', title: `All Free Online Tools | ${cfg.name}`, description: `Browse all free online tools on ${cfg.name}: ${LIVE_CATS.slice(0, 5).map((c) => c.name.toLowerCase()).join(', ') || 'image, PDF, calculators and more'}.`,
    body, jsonld: [crumbLD(items)],
  }));
}

// Categories
function buildCategories() {
  for (const c of LIVE_CATS) {
    const list = BY_CAT[c.slug];
    const items = [{ name: 'Home', href: '/' }, { name: 'All tools', href: '/tools/' }, { name: c.name, href: `/category/${c.slug}/` }];
    const body = `<div class="wrap">${crumbs(items)}
    <h1 class="page-h">${e(c.name)}</h1>
    <p class="lead">${e(c.blurb)}</p>
    ${adSlot('top')}
    <ul class="grid">${list.map(card).join('')}</ul>
    ${adSlot('bottom')}</div>`;
    write(`category/${c.slug}/index.html`, layout({
      type: 'listing', path: `/category/${c.slug}/`, title: `${c.name} – Free Online | ${cfg.name}`, description: c.blurb.length > 150 ? c.blurb.slice(0, 150) : c.blurb,
      body, jsonld: [crumbLD(items), { '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.name, url: url(`/category/${c.slug}/`), hasPart: list.map((t) => ({ '@type': 'WebApplication', name: t.name, url: url(`/${t.slug}/`) })) }],
    }));
  }
}

// Tool pages
function buildToolPages() {
  for (const t of TOOLS) {
    const c = CAT[t.category];
    const items = [{ name: 'Home', href: '/' }, { name: c.name, href: `/category/${c.slug}/` }, { name: t.name, href: `/${t.slug}/` }];
    const rel = [...(t.related || []).map((s) => TOOLS.find((x) => x.slug === s)).filter(Boolean), ...BY_CAT[t.category].filter((x) => x.slug !== t.slug)].filter((x, i, a) => a.indexOf(x) === i && x.slug !== t.slug).slice(0, 6);
    const title = (t.seo && t.seo.title) || (`${t.name} – Free Online | ${cfg.name}`.length <= 62 ? `${t.name} – Free Online | ${cfg.name}` : `${t.name} | ${cfg.name}`);
    const h1 = (t.seo && t.seo.h1) || t.name;
    const howto = t.howto.length ? `<h2>How to use ${e(t.name)}</h2><ol>${t.howto.map((s) => `<li>${e(s)}</li>`).join('')}</ol>` : '';
    const faq = t.faq.length ? `<h2>Frequently asked questions</h2><div class="faq">${t.faq.map((f) => `<details><summary>${e(f.q)}</summary><p>${e(f.a)}</p></details>`).join('')}</div>` : '';
    const body = `<div class="wrap">${crumbs(items)}
<div class="tool-layout">
  <article>
    <header class="tool-head"><h1>${e(h1)}</h1><p class="lead">${e(t.tagline)}</p></header>
    ${adSlot('top')}
    <section id="tool-root" class="tool-card is-loading" aria-label="${e(t.name)}"><noscript><p>${e(t.name)} needs JavaScript. Please enable it to use this tool.</p></noscript><div class="skeleton" aria-hidden="true"></div></section>
    ${adSlot('inline')}
    <section class="prose">${t.content}${howto}${faq}</section>
    ${rel.length ? `<section><h2 class="sec-h">Related tools</h2><ul class="grid">${rel.map(card).join('')}</ul></section>` : ''}
    ${adSlot('bottom')}
  </article>
  <aside class="side" aria-label="More tools">
    ${adSlot('sidebar')}
    <div class="side-box"><h2 class="foot-h">More ${e(c.name.toLowerCase())}</h2><ul>${BY_CAT[t.category].filter((x) => x.slug !== t.slug).slice(0, 8).map((x) => `<li><a href="/${x.slug}/">${e(x.name)}</a></li>`).join('')}</ul></div>
  </aside>
</div></div>`;
    const jsonld = [
      crumbLD(items),
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: t.name, url: url(`/${t.slug}/`), description: t.description, applicationCategory: c.schema, operatingSystem: 'Any', browserRequirements: 'Requires JavaScript', inLanguage: cfg.language, isAccessibleForFree: true, dateModified: t.updated, keywords: t.keywords.join(', '), offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: { '@id': url('/#org') } },
    ];
    if (t.faq.length) jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: t.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
    const v = fileHash(path.join(t.dir, 'tool.js'), ...(t.hasCss ? [path.join(t.dir, 'tool.css')] : []));
    fs.mkdirSync(path.join(DIST, 'assets/tools', t.slug), { recursive: true });
    fs.copyFileSync(path.join(t.dir, 'tool.js'), path.join(DIST, 'assets/tools', t.slug, 'tool.js'));
    if (t.hasCss) fs.copyFileSync(path.join(t.dir, 'tool.css'), path.join(DIST, 'assets/tools', t.slug, 'tool.css'));
    write(`${t.slug}/index.html`, layout({
      type: 'tool', path: `/${t.slug}/`, title, description: t.description, body, jsonld, ogType: 'website',
      data: { tool: t.slug, cat: t.category, apis: t.apis.join(',') },
      head: t.hasCss ? `<link rel="stylesheet" href="/assets/tools/${t.slug}/tool.css?v=${v}">` : '',
      scripts: `<script src="/assets/tools/${t.slug}/tool.js?v=${v}" defer></script>`,
    }));
  }
}

// Legal / info pages
function simplePage(slug, title, description, inner) {
  const items = [{ name: 'Home', href: '/' }, { name: title, href: `/${slug}/` }];
  const body = `<div class="wrap narrow">${crumbs(items)}<h1 class="page-h">${e(title)}</h1><div class="prose">${inner}</div></div>`;
  write(`${slug}/index.html`, layout({ type: 'content', path: `/${slug}/`, title: `${title} | ${cfg.name}`, description, body, jsonld: [crumbLD(items)] }));
}
function buildInfoPages() {
  const mail = hasMail ? `<a href="mailto:${e(cfg.email)}">${e(cfg.email)}</a>` : '<em>(set "email" in site.config.json)</em>';
  simplePage('about', `About ${cfg.name}`, `Learn about ${cfg.name}, a collection of free online tools for images, PDFs, calculators, converters and more.`,
    `<p>${e(cfg.name)} is a collection of free online tools built to be quick, clear and easy to use. We add new tools regularly, covering image editing, PDF utilities, calculators, unit converters, text utilities and developer tools.</p>
<h2>What we care about</h2><p>Tools should open fast, work on a phone, and do one job well. Where it is technically possible, files are processed in your browser and are not uploaded to our servers.</p>
<h2>How we pay for it</h2><p>${e(cfg.name)} is free to use and is supported by advertising. Ads help cover hosting and let us keep building new tools.</p>
<h2>Contact</h2><p>Questions, bug reports or tool requests? See our <a href="/contact/">contact page</a>.</p>`);
  simplePage('contact', `Contact ${cfg.name}`, `Contact ${cfg.name} for support, feedback, tool requests or business enquiries.`,
    `<p>We read every message. For support, bug reports, tool suggestions or advertising enquiries, email us at ${mail}.</p><p>Please include the tool name and your browser if you are reporting a problem.</p>`);
  simplePage('privacy-policy', 'Privacy Policy', `How ${cfg.name} handles data, cookies and third-party advertising.`,
    `<p><em>Last updated: ${TODAY}. This is a starting template. Review it and adapt it to your situation and local law.</em></p>
<h2>Files and inputs</h2><p>Most tools run in your browser, so your files and text stay on your device. Some tools may use a server or a third-party service to complete a task. Those tools say so on the page.</p>
<h2>Information we collect</h2><p>We may collect basic, non-identifying usage data such as pages viewed, browser type and approximate location through analytics so we can improve the site.</p>
<h2>Cookies and advertising</h2><p>We show ads from third-party networks, which may include Adsterra and Monetag. These partners may use cookies or similar technologies to show ads and measure performance. You can control cookies in your browser settings.</p>
<h2>Third-party links</h2><p>Our pages may link to other sites. We are not responsible for their content or privacy practices.</p>
<h2>Children</h2><p>${e(cfg.name)} is not directed at children under 13.</p>
<h2>Contact</h2><p>Questions about this policy? ${mail}</p>`);
  simplePage('terms', 'Terms of Use', `Terms of use for ${cfg.name}.`,
    `<p><em>Last updated: ${TODAY}. This is a starting template. Review it before relying on it.</em></p>
<h2>Use of the service</h2><p>${e(cfg.name)} provides free online tools "as is". You agree to use them lawfully and not to misuse or attempt to disrupt the service.</p>
<h2>No warranty</h2><p>Results are provided for general information. Calculators and converters are aids, not professional financial, medical or legal advice. Check important results yourself.</p>
<h2>Your content</h2><p>You keep ownership of the files and text you use with our tools. You are responsible for having the right to process them.</p>
<h2>Limitation of liability</h2><p>To the extent permitted by law, ${e(cfg.name)} is not liable for any loss arising from use of the site.</p>
<h2>Changes</h2><p>We may update these terms from time to time. Continued use means you accept the updated terms.</p>`);
}

function build404() {
  write('404.html', layout({ type: 'content', path: '/404.html', noindex: true, title: `Page not found | ${cfg.name}`, description: 'This page could not be found.', body: `<div class="wrap narrow"><h1 class="page-h">Page not found</h1><p class="lead">That page does not exist or has moved.</p><p><a class="btn btn-primary" href="/tools/">Browse all tools</a></p></div>` }));
}

/* ---------- 5. machine files ---------- */
function buildMachineFiles() {
  const urls = [
    ['/', TODAY, 'daily', '1.0'], ['/tools/', TODAY, 'daily', '0.9'],
    ...LIVE_CATS.map((c) => [`/category/${c.slug}/`, TODAY, 'weekly', '0.8']),
    ...TOOLS.map((t) => [`/${t.slug}/`, t.updated, 'monthly', t.featured ? '0.9' : '0.8']),
    ['/about/', TODAY, 'yearly', '0.3'], ['/contact/', TODAY, 'yearly', '0.3'], ['/privacy-policy/', TODAY, 'yearly', '0.2'], ['/terms/', TODAY, 'yearly', '0.2'],
  ];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, m, f, pr]) => `<url><loc>${url(p)}</loc><lastmod>${m}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${url('/sitemap.xml')}\n`);
  write('manifest.webmanifest', JSON.stringify({ name: cfg.name, short_name: cfg.name, description: cfg.description, start_url: '/', scope: '/', display: 'standalone', background_color: '#F6F8F7', theme_color: cfg.themeColor, icons: [{ src: '/assets/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/img/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }] }));
  // Public tool registry: powers search, the admin panel's tool list and API requirements.
  write('tools.json', JSON.stringify(TOOLS.map((t) => ({ s: t.slug, n: t.name, c: t.category, d: t.tagline, k: t.keywords.join(' ').toLowerCase(), a: t.apis }))));
  write('categories.json', JSON.stringify(CATS.map((c) => ({ slug: c.slug, name: c.name }))));
}

/* ---------- run ---------- */
buildHome();
buildToolsIndex();
buildCategories();
buildToolPages();
buildInfoPages();
build404();
buildMachineFiles();

if (!hasMail) warn('site.config.json "email" is empty. Add one: ad networks expect a working contact address.');
if (!cfg.verification.google) warn('No Google Search Console verification tag set (site.config.json > verification.google).');
console.log(`\nZentools built: ${TOOLS.length} live tool(s), ${LIVE_CATS.length} categor${LIVE_CATS.length === 1 ? 'y' : 'ies'}, ${DRAFTS.length} draft(s) skipped.`);
console.log(`Output: ${DIST}  (asset version ${V})\n`);
