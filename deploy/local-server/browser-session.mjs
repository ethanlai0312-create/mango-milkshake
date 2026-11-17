import {randomBytes} from 'node:crypto';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const cookieName=secure=>secure?'__Host-mango_session':'mango_local_session';
export function sessionCookie(id,secure,clear=false){return `${cookieName(secure)}=${clear?'':id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:86400}${secure?'; Secure':''}`;}
export function readCookie(header,secure){const parts=String(header??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName(secure)+'='));if(parts.length!==1)return null;const id=parts[0].slice(cookieName(secure).length+1);return /^[a-f0-9]{64}$/.test(id)?id:null;}
function metadata(tokens){
 const payload=JSON.parse(Buffer.from(tokens.access_token.split('.')[1],'base64url').toString());
 if(!uuid.test(payload.session_id)||!uuid.test(tokens.user?.id)||payload.sub!==tokens.user.id)throw Error('Invalid upstream session');
 return {session_id:payload.session_id,user:{id:tokens.user.id},expires_at:Number(tokens.expires_at??payload.exp),expires_in:Number(tokens.expires_in??3600),token_type:'cookie'};
}
/** Only trusted upstream responses enter this in-memory vault. Never serialize entries. */
export function createSessionVault({maxSessions=1000,now=Date.now}={}){
 const entries=new Map();
 function discard(entry){if(entry){entry.active=false;entries.delete(entry.id);entry.tokens=null;}}
 function get(id){const value=entries.get(id);if(!value)return null;if(now()-value.created>86400000||now()-value.seen>3900000){discard(value);return null;}value.seen=now();return value;}
 function adopt(tokens,apikey,previous){
  const info=metadata(tokens);if(typeof tokens.refresh_token!=='string'||!tokens.refresh_token)throw Error('Missing upstream refresh token');
  if(previous)discard(previous);
  for(const entry of entries.values())if(now()-entry.seen>3900000)discard(entry);
  if(entries.size>=maxSessions)throw Error('Session capacity reached');
  const id=randomBytes(32).toString('hex'),entry={id,tokens:{access_token:tokens.access_token,refresh_token:tokens.refresh_token},info,apikey,created:now(),seen:now(),active:true,refreshing:null};entries.set(id,entry);return entry;
 }
 async function refresh(entry,perform,force=false){
  if(!entry?.active)throw Error('Session expired');if(!force&&entry.info.expires_at*1000>now()+90000)return entry;
  if(!entry.refreshing)entry.refreshing=(async()=>{const tokens=await perform(entry.tokens.refresh_token,entry.apikey);if(!entry.active)throw Error('Session expired');entry.info=metadata(tokens);entry.tokens={access_token:tokens.access_token,refresh_token:tokens.refresh_token};return entry;})().finally(()=>{entry.refreshing=null;});
  return entry.refreshing;
 }
 return {get,adopt,discard,refresh,metadata:entry=>entry?.active?structuredClone(entry.info):null,size:()=>entries.size};
}
export function csrfAllowed(headers,origin){
 if(headers.origin&&headers.origin!==origin)return false;
 if(headers['sec-fetch-site']&&headers['sec-fetch-site']!=='same-origin'&&headers['sec-fetch-site']!=='none')return false;
 return headers['x-mango-requested-with']==='1';
}
/** Remove all credential-bearing Auth fields, including nested password-change responses. */
export function scrubSessionPayload(payload){
 if(!payload||typeof payload!=='object')return payload;
 if(Array.isArray(payload))return payload.map(value=>scrubSessionPayload(value));
 return Object.fromEntries(Object.entries(payload).filter(([key])=>!['access_token','refresh_token','provider_token','provider_refresh_token','id_token'].includes(key)).map(([key,value])=>[key,scrubSessionPayload(value)]));
}
