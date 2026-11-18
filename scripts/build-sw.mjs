import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {publicStaticFile} from '../deploy/local-server/gateway-policy.mjs';
const root=process.argv[2]?pathToFileURL(resolve(process.argv[2])+sep):new URL('../dist/',import.meta.url);
async function walk(dir,prefix=''){const paths=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isDirectory())paths.push(...await walk(new URL(entry.name+'/',dir),prefix+entry.name+'/'));else if(!entry.name.endsWith('.map')&&entry.name!=='sw.js')paths.push(prefix+entry.name);}return paths;}
const paths=(await walk(root)).filter(path=>publicStaticFile('/'+path)).sort();
const hash=createHash('sha256').update(await readFile(new URL(import.meta.url))).update(await readFile(new URL('../deploy/local-server/gateway-policy.mjs',import.meta.url)));
for(const path of paths){const bytes=await readFile(new URL(path,root));hash.update(JSON.stringify([path,bytes.length])).update(bytes);}
const version=hash.digest('hex').slice(0,16);
await writeFile(new URL('sw.js',root),`const CACHE='mango-shell-${version}';
const FILES=new Set(${JSON.stringify(paths)}.map(path=>new URL(path,self.registration.scope).href));
const HOME=new URL(self.registration.scope);
const INDEX=new URL('index.html',HOME);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...FILES].map(url=>new Request(url,{cache:'reload',redirect:'error'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mango-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  if(url.pathname!==HOME.pathname&&url.pathname!==INDEX.pathname)return;
  const cached=async()=>{const cache=await caches.open(CACHE),html=await cache.match(INDEX.href,{ignoreVary:true});if(!html)throw new Error('Offline shell unavailable');return new Response(await html.arrayBuffer(),{status:html.status,statusText:html.statusText,headers:html.headers});};
  event.respondWith(fetch(request).then(async response=>{if(response.status<500)return response;try{return await cached();}catch{return response;}}).catch(cached));return;
 }
 if(FILES.has(url.href))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request,{ignoreVary:true}))??fetch(request)));
});`);
console.log('Offline application shell:',paths.length,'assets, version',version);
