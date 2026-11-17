import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const version=(await readFile('VERSION','utf8')).trim();
const parts=/^v(\d{4})\.(\d{2})\.(\d{2})\.(\d{2,})$/.exec(version);
assert(parts,'Use vYYYY.MM.DD.NN');
const [,year,month,day,ordinal]=parts,date=new Date(Date.UTC(+year,+month-1,+day));
assert(date.getUTCFullYear()===+year&&date.getUTCMonth()===+month-1&&date.getUTCDate()===+day&&+ordinal>=1,'Valid calendar date and positive daily ordinal required');
const semver=`${+year}.${+month}.${+day}+update.${ordinal}`;
assert.equal(JSON.parse(await readFile('package.json','utf8')).version,semver);
const readme=await readFile('README.md','utf8'),changelog=await readFile('CHANGELOG.md','utf8');
assert(readme.includes(version)&&changelog.includes('## '+version),'Document this release');
const demo=await readFile('supabase/demo-accounts.sql','utf8');
for(const [,name,password,storedRole] of demo.matchAll(/\('([a-z_ ]+)','([a-z_ ]+)','([a-z_ ]+)'\)/g)){
 const role=storedRole==='admin'?'primary admin':storedRole==='secondary_admin'?'secondary admin':storedRole==='visitor'?'user':storedRole;assert.equal(name,role);assert.equal(password,role);assert(readme.includes(`| ${role} | ${name} | ${name} | ${password} |`),'Document every demo role');
}
assert(demo.includes('values(user_id,item.username,item.username,item.account_role'),'Demo nickname and login ID must equal the role name');
assert(readme.includes('https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2'));
assert(readme.includes('https://apps.apple.com/app/google-authenticator/id388497605'));
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const path of files){
 assert(!/(?:^|\/)(?:uploads|backups|logs|outputs|work|test-results)(?:\/|$)|\.(?:dump|db|sqlite|csv|docx|pdf|key|pem|pfx)$/i.test(path),'Data file must not be published: '+path);
 assert(!/(?:^|\/)\.env(?!\.example$)/.test(path),'Private environment file: '+path);
 const text=await readFile(path,'utf8');assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\$2[aby]\$\d\d\$|eyJ[A-Za-z0-9_-]{15,}\./.test(text),'Credential material: '+path);
}
console.log(version+': release metadata, demo documentation and source-only paths checked.');
