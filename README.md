# Zentools – base website

Static site + secure admin panel for **Cloudflare Pages** (`zentools.pages.dev`). No tools are included yet. Tools are added later, one folder each.

## What is included
- Fast static pages (system fonts, small CSS and JS, no frameworks), light and dark theme
- Home, All tools, Category pages, one page per tool, About, Contact, Privacy, Terms, 404
- SEO: unique title/description/canonical per page, Open Graph + Twitter cards, JSON-LD (WebSite + SearchAction, Organization, BreadcrumbList, WebApplication, FAQPage, CollectionPage), `sitemap.xml`, `robots.txt`, favicon set (ico, 48/32/192/512, Apple touch), web manifest, built-in search
- Admin panel at `/admin/`: ads (Adsterra / Monetag / both), per-tool controls, API keys, analytics, consent banner, ads.txt, backup
- Server proxy so paid/free API keys never reach the browser

## 1. Put it on GitHub
```bash
git init && git add . && git commit -m "Zentools base"
git branch -M main
git remote add origin https://github.com/YOU/zentools.git
git push -u origin main
```

## 2. Create the Cloudflare Pages project
Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git > pick the repo.
- Project name: `zentools` (gives `zentools.pages.dev`)
- Build command: `node scripts/build.js`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION` = `20`

## 3. Create the admin login
On your computer:
```bash
node scripts/hash-password.mjs "a long passphrase of 12+ characters"
```
In Pages > Settings > Variables and Secrets (Production), add as **Secrets**: `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, and (optional) `ADMIN_USER`.

## 4. Create the settings store (KV)
Workers & Pages > KV > Create namespace `zentools-settings`. Then Pages project > Settings > Bindings > Add > KV namespace:
- Variable name: `ZT_KV`
- Namespace: `zentools-settings`

Redeploy once (Deployments > Retry), then open `/admin/` and sign in.

**Extra protection (recommended, free):** Cloudflare Zero Trust > Access > add an application for `zentools.pages.dev/admin*` and `/api/admin*` so only your email can even reach the login page.

## 5. Site details
Edit `site.config.json`: set `email` (ad networks want a real contact address), and later the Google/Bing verification codes.

## 6. Get indexed on Google
1. Search Console > Add property > URL prefix `https://zentools.pages.dev` > verify with the HTML tag. Paste the code into `site.config.json` > `verification.google`, push, then click Verify.
2. Sitemaps > submit `sitemap.xml`.
3. Use URL Inspection > Request indexing for the home page and your first tools.
4. Same for Bing Webmaster Tools (can import from Search Console).
Google shows your site name and favicon from the homepage markup already included. Rankings take weeks; unique helpful copy on each tool page is what moves them.

## Adding a tool (the phased workflow)
```bash
npm run new-tool -- word-counter text "Word Counter"
```
This creates `tools/word-counter/` with:
- `meta.json`: name, category, description (120-160 chars), keywords, FAQ, how-to steps, `apis`, `related`, `featured`. Set `"status": "live"` to publish. `draft` tools are not built at all.
- `tool.js`: `Zentools.register('word-counter', { mount(root, ctx) { ... } })`
- `content.html`: 150-300 words of original copy (important for SEO)
- optional `tool.css`

Push to GitHub. The build automatically creates the page `/word-counter/`, adds it to its category page, the home page (if `featured`), search, and `sitemap.xml`. Nothing else to edit. Category slugs are in `categories.json` (add more there).

Helpers available in `tool.js`: `ctx.util` (`fmtBytes`, `debounce`, `download`, `copy`, `toast`, `readFile`, `loadScript`) and CSS classes `zt-field`, `zt-row`, `zt-out`, `zt-stats`, `zt-drop`, `btn`, `btn-primary`. Load heavy libraries (pdf-lib, ffmpeg.wasm, etc.) with `ctx.util.loadScript()` only inside the tool that needs them, so every other page stays fast.

### Tools that need an API
In `meta.json` add `"apis": ["removebg"]`. In `tool.js`:
```js
const res = await ctx.api('removebg', formData);   // key is added on the server
```
After deploy, open Admin > API keys: the `removebg` row appears. Enter the endpoint, key and how it is sent, enable it, save. No redeploy needed to change keys.

## Admin panel guide
- **Ads:** paste Adsterra/Monetag banner code into each slot (top, inline, sidebar, bottom, mobile sticky). Choose Adsterra, Monetag, rotate, or both. Paste popunder/social-bar/push scripts under Page-level scripts. Banners load lazily and are isolated in sandboxed frames so two networks cannot conflict. If a network does not render, set that slot to "Direct".
- **Tools:** disable any tool, turn all ads off for it, turn page scripts (popunders) off, or turn individual slots off.
- **Site:** Google Analytics / Cloudflare Web Analytics, consent banner (turn on for EU/UK traffic), announcement bar, `ads.txt`, custom head/body code.
- Changes go live within about a minute (public config is cached 60 s).

## Security model
- Password stored only as a PBKDF2 hash; login rate-limited (5 tries / 15 min / IP)
- Session: HMAC-signed, HttpOnly, Secure, SameSite=Strict, `__Host-` cookie, 8 hours; "sign out everywhere" revokes all
- Every write checks Origin and a custom header (CSRF), admin pages ship a strict CSP, `noindex`
- API keys live only in KV; the public config endpoint never returns them; the proxy only talks to endpoints you configured, only for your own origin, rate limited
- Ad and custom-code fields run arbitrary scripts on your pages, so only paste code from sources you trust

## Local preview
```bash
npm run dev      # builds, then runs wrangler with a local KV
```
Put `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` in a `.dev.vars` file for local login.

## Notes
- Do not add fake ratings/reviews to tool schema: Google penalizes it.
- Legal pages are starter templates. Have them reviewed.
- Adsterra/Monetag may require site approval first; add your domain in their dashboards.
- A custom domain later: add it in Pages > Custom domains and update `url` in `site.config.json`.
