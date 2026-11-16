import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const version=(await readFile('VERSION','utf8')).trim();
assert(/^v\d{2}\.\d{2}\.\d{3}$/.test(version),'Use vMM.FF.PPP');
const semver=version.slice(1).split('.').map(Number).join('.');
assert.equal(JSON.parse(await readFile('package.json','utf8')).version,semver);
const readme=await readFile('README.md','utf8'),changelog=await readFile('CHANGELOG.md','utf8');
assert(readme.includes(version)&&changelog.includes('## '+version),'Document this release');
const demo=await readFile('supabase/demo-accounts.sql','utf8');
for(const [,name,password,storedRole] of demo.matchAll(/\('([a-z]+)','([a-z]+)','([a-z]+)'\)/g)){
 const role=storedRole==='visitor'?'user':storedRole;assert.equal(name,role);assert.equal(password,role);assert(readme.includes(`| ${role} | ${name} | ${password} |`),'Document every demo role');
}
assert(readme.includes('https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2'));
assert(readme.includes('https://apps.apple.com/app/google-authenticator/id388497605'));
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const path of files){
 assert(!/(?:^|\/)(?:uploads|backups|logs|outputs|work|test-results)(?:\/|$)|\.(?:dump|db|sqlite|csv|docx|pdf|key|pem|pfx)$/i.test(path),'Data file must not be published: '+path);
 assert(!/(?:^|\/)\.env(?!\.example$)/.test(path),'Private environment file: '+path);
 const text=await readFile(path,'utf8');assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\$2[aby]\$\d\d\$|eyJ[A-Za-z0-9_-]{15,}\./.test(text),'Credential material: '+path);
}
console.log(version+': release metadata, demo documentation and source-only paths checked.');
