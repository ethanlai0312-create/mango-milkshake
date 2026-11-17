import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const version = (await readFile('VERSION', 'utf8')).trim();
const parts = /^v(\d{4})\.(\d{2})\.(\d{2})\.(\d{2,})$/.exec(version);
assert(parts, 'Use vYYYY.MM.DD.NN');
const [, year, month, day, ordinal] = parts, date = new Date(Date.UTC(+year, +month - 1, +day));
assert(date.getUTCFullYear() === +year && date.getUTCMonth() === +month - 1 && date.getUTCDate() === +day && +ordinal >= 1, 'Valid calendar date and positive daily ordinal required');
const semver = `${+year}.${+month}.${+day}+update.${ordinal}`;
assert.equal(JSON.parse(await readFile('package.json', 'utf8')).version, semver);
const readme = await readFile('README.md', 'utf8'), changelog = await readFile('CHANGELOG.md', 'utf8');
assert(readme.includes(version) && changelog.includes('## ' + version), 'Document this release');
assert(readme.includes('版本快照與隱私'), 'README must document per-version snapshots and source-only publishing');
assert(!readme.includes('管理員雙重驗證器'), 'Administrator TOTP guide must be removed');
const demo = await readFile('supabase/demo-accounts.sql', 'utf8');
for (const [, name, password, storedRole] of demo.matchAll(/\('([a-z_ ]+)','([a-z_ ]+)','([a-z_ ]+)'\)/g)) {
  const role = storedRole === 'admin' ? 'primary admin' : storedRole === 'secondary_admin' ? 'secondary admin' : storedRole === 'visitor' ? 'user' : storedRole;
  assert.equal(name, role);
  assert.equal(password, role);
  assert(readme.includes(`| ${role} | ${name} | ${name} | ${password} |`), 'Document every demo role');
}
assert(demo.includes('values(user_id,item.username,item.username,item.account_role'), 'Demo nickname and login ID must equal the role name');

// Source-only gate: the repository must never carry user data, exam content,
// uploads, logs, database backups, environment files or real account identifiers.
const forbiddenPaths = [
  /(^|\/)(outputs?|work|backups?|uploads?|logs?|test-results|node_modules|\.secrets|\.codex)(\/|$)/i,
  /(^|\/)\.env(?!\.example$)/i,
  /\.(dump|db|sqlite3?|csv|tsv|xlsx?|docx?|pptx?|pdf|zip|tar|gz|tgz|7z|rar|png|jpe?g|gif|webp|bmp|tiff?|mp3|mp4|mov|avi|wav|log|jsonl|ndjson|bak|pfx|p12|pem|key|cer|crt|pcap|pgp|asc|rdb|sqlitedb)$/i,
];
const forbiddenText = [
  ['real site domain', /mangomilkshake\.com/i],
  ['real Supabase project', /iywyfocbzoppidmovbso/i],
  ['real administrator name', /\bEthan\b|ＥＴＨＡＮ/],
  ['real login IDs', /\b(?:161075|161118|192117|161086)\b/],
  ['private LAN address', /\b192\.168\.\d{1,3}\.\d{1,3}\b/],
  ['private WSL path', /\/root\/mango/],
  ['private tunnel identifier', /b5bf2d99-e24c-4ab0-ac3b-d7985ea9d8a3/],
  ['private deployment file', /cloudflare-owned-tunnel\.token|lan-tls\//],
  ['leaked historical password', /110312/],
  ['real exam title', /华为ICT|計算機概論題庫|公民第一段/],
];
const credentialMaterial = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\$2[aby]\$\d\d\$|eyJ[A-Za-z0-9_-]{15,}\./;
const maxBytes = 1024 * 1024;
const files = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
for (const path of files) {
  for (const re of forbiddenPaths) assert(!re.test(path), 'Data/private path must not be published: ' + path);
  const info = await stat(path);
  assert(info.size <= maxBytes, 'File too large for a source-only repository: ' + path);
  // The gate script itself defines the forbidden patterns, so it is exempt from
  // the content scan; it still must satisfy the path and size checks above.
  if (path === 'scripts/check-release.mjs') continue;
  const text = await readFile(path, 'utf8');
  for (const [label, re] of forbiddenText) assert(!re.test(text), 'Private content (' + label + '): ' + path);
  assert(!credentialMaterial.test(text), 'Credential material: ' + path);
}
console.log(version + ': release metadata, demo documentation, per-version snapshots and source-only privacy gate passed (' + files.length + ' files).');
