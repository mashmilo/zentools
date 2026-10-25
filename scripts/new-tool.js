#!/usr/bin/env node
// Usage: node scripts/new-tool.js word-counter text "Word Counter"
const fs = require('fs'), path = require('path');
const [slug, category, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ');
if (!slug || !category || !name) {
  console.error('Usage: node scripts/new-tool.js <slug> <category> "<Tool Name>"');
  process.exit(1);
}
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { console.error('Slug must be lowercase letters, numbers and hyphens.'); process.exit(1); }
const root = path.resolve(__dirname, '..');
const cats = JSON.parse(fs.readFileSync(path.join(root, 'categories.json'), 'utf8')).map(c => c.slug);
if (!cats.includes(category)) { console.error('Unknown category. Use one of: ' + cats.join(', ')); process.exit(1); }
const dest = path.join(root, 'tools', slug);
if (fs.existsSync(dest)) { console.error('tools/' + slug + ' already exists.'); process.exit(1); }
fs.cpSync(path.join(root, 'tools', '_template'), dest, { recursive: true });
const mp = path.join(dest, 'meta.json');
const meta = JSON.parse(fs.readFileSync(mp, 'utf8'));
meta.name = name; meta.slug = slug; meta.category = category;
meta.keywords = [name.toLowerCase(), name.toLowerCase() + ' online', 'free ' + name.toLowerCase()];
meta.updated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(mp, JSON.stringify(meta, null, 2) + '\n');
fs.rmSync(path.join(dest, 'README.md'), { force: true });
console.log('Created tools/' + slug + '. Edit meta.json + tool.js, then set "status": "live".');
