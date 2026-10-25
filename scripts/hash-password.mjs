// Usage: node scripts/hash-password.mjs "your password"
// Prints the values to paste into Cloudflare Pages -> Settings -> Environment variables.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
const pw = process.argv[2];
if (!pw || pw.length < 12) {
  console.error('Pass a password of at least 12 characters:\n  node scripts/hash-password.mjs "my long passphrase"');
  process.exit(1);
}
const iter = 100000; // Cloudflare Workers allows at most 100000 PBKDF2 iterations
const salt = randomBytes(16);
const hash = pbkdf2Sync(pw, salt, iter, 32, 'sha256');
const b64u = (b) => Buffer.from(b).toString('base64url');
console.log('\nAdd these as ENCRYPTED variables in Cloudflare Pages:\n');
console.log('ADMIN_PASSWORD_HASH = pbkdf2$' + iter + '$' + b64u(salt) + '$' + b64u(hash));
console.log('SESSION_SECRET      = ' + randomBytes(48).toString('base64url'));
console.log('ADMIN_USER          = admin   (change it to anything you like)\n');
