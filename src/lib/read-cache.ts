/** Short-lived display cache only. Auth, live answers and writes never read from it. */
export const READ_CACHE_TTL_MS=5*60*1000;
export const READ_CACHE_MAX_ENTRIES=40;
export const READ_CACHE_MAX_BYTES=1024*1024;
const cacheable=new Set(['exams','files','historyQuery','leaderboard','conversions','conversionInputs','conversionInfo','invites','logs']);
export const isReadCacheAction=(action:string)=>cacheable.has(action);
type Entry={value:unknown;expires:number;bytes:number};
export type ReadCacheScope={readonly accountId:string;readonly generation:number};
const entries=new Map<string,Entry>();
const mediaUrls=new Set<string>();
let accessRole:string|undefined;
let account:string|undefined,generation=0,totalBytes=0;
export const getReadCacheAccount=()=>account;
export const getReadCacheRole=()=>accessRole;
export function retainMedia(scope:ReadCacheScope|undefined,url:string){if(!scope||scope.accountId!==account||scope.generation!==generation){URL.revokeObjectURL(url);throw new Error("账号已切换，请重新读取");}mediaUrls.add(url);setTimeout(()=>{mediaUrls.delete(url);URL.revokeObjectURL(url);},300000);return url;}

function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]));
 return value;
}
function key(action:string,params:Record<string,unknown>){
 // Round-trip first to match the actual JSON request's undefined/date semantics.
 return JSON.stringify([account,action,canonical(JSON.parse(JSON.stringify(params)))]);
}
function remove(name:string){const entry=entries.get(name);if(entry){totalBytes-=entry.bytes;entries.delete(name);}}
function clear(){for(const url of mediaUrls)URL.revokeObjectURL(url);mediaUrls.clear();entries.clear();totalBytes=0;generation++;}

/** Call only after the normal server-verified profile has selected the active account. */
export function setReadCacheAccount(accountId?:string,role?:string){
 if(accountId&&accountId===account&&role===accessRole)return;
 accessRole=role;
 account=accountId;clear();
}
export function captureReadCacheScope(accountId?:string):ReadCacheScope|undefined{
 return accountId&&accountId===account?{accountId,generation}:undefined;
}
/** Prevent reads started before a mutation/account switch from repopulating old data. */
export function invalidateReadCache(accountId?:string){if(accountId&&accountId===account)clear();}

export function rememberRead(scope:ReadCacheScope|undefined,action:string,params:Record<string,unknown>,value:unknown){
 if(!scope||scope.accountId!==account||scope.generation!==generation||!cacheable.has(action))return;
 try{
  const encoded=JSON.stringify(value);if(encoded===undefined)return;
  const name=key(action,params),bytes=(encoded.length+name.length)*2;if(bytes>READ_CACHE_MAX_BYTES)return;
  const now=Date.now();
  for(const [entryName,entry] of entries)if(entry.expires<=now)remove(entryName);
  remove(name);
  while(entries.size>=READ_CACHE_MAX_ENTRIES||totalBytes+bytes>READ_CACHE_MAX_BYTES){const oldest=entries.keys().next().value;if(oldest===undefined)break;remove(oldest);}
  entries.set(name,{value:structuredClone(value),expires:now+READ_CACHE_TTL_MS,bytes});totalBytes+=bytes;
 }catch{/* Display caching must never fail a successful server request. */}
}

/** Initial UI value; callers still issue their ordinary authoritative API request. */
export function peekRead<T=any>(action:string,params:Record<string,unknown>={}):T|undefined{
 if(!account||!cacheable.has(action))return undefined;
 try{
  const name=key(action,params),entry=entries.get(name);if(!entry)return undefined;
  if(entry.expires<=Date.now()){remove(name);return undefined;}
  // Touch LRU without extending freshness; return a copy so local UI edits stay local.
  entries.delete(name);entries.set(name,entry);
  return structuredClone(entry.value) as T;
 }catch{return undefined;}
}
