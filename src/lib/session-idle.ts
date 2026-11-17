import type {Session} from '@supabase/supabase-js';

export const SESSION_EXPIRED = 'SESSION_EXPIRED';
export type IdleDeadline = {idle_expires_at:string;server_time:string};
type StoredDeadline = {serverEnd:number;localEnd:number;expired?:true};
const prefix = 'mango:idle:';
const expired = new Set<string>();
const deadlines = new Map<string,StoredDeadline>();
const updates = new EventTarget();

export function sessionId(session:Session|null|undefined):string|undefined{
 try {
  const cookieId=(session as unknown as {session_id?:string})?.session_id;
  if(typeof cookieId==='string'&&/^[0-9a-f-]{36}$/i.test(cookieId))return cookieId;
  const part=session?.access_token.split('.')[1];
  const id=part&&JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/'))).session_id;
  if(typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id))return id;
 } catch {/* The server independently authenticates the token. */}
}

function stored(id:string):StoredDeadline|null{
 try{
  const value=JSON.parse(localStorage.getItem(prefix+id)??'null');
  if(value&&Number.isFinite(value.serverEnd)&&Number.isFinite(value.localEnd))return value;
 }catch{/* In-memory deadline still applies for this page. */}
 return null;
}

export function idleEnd(id:string):number|undefined{
 const local=deadlines.get(id),shared=stored(id);
 return shared&&(!local||shared.serverEnd>local.serverEnd)?shared.localEnd:local?.localEnd;
}

export function isIdleExpired(id:string){
 const end=idleEnd(id);
 return expired.has(id)||stored(id)?.expired===true||(end!==undefined&&end<=Date.now());
}

export function markIdleExpired(id:string){
 if(expired.has(id))return;
 expired.add(id);
 try{localStorage.setItem(prefix+id,JSON.stringify({serverEnd:0,localEnd:0,expired:true}));}catch{/* The server still enforces expiry. */}
 updates.dispatchEvent(new Event(id));
}

export function acceptIdleDeadline(id:string,response:IdleDeadline,roundTripMs=0){
 const serverEnd=Date.parse(response.idle_expires_at),serverNow=Date.parse(response.server_time);
 if(expired.has(id)||stored(id)?.expired||!Number.isFinite(serverEnd)||!Number.isFinite(serverNow))return;
 const latest=Math.max(deadlines.get(id)?.serverEnd??0,stored(id)?.serverEnd??0);
 if(latest>=serverEnd)return;
 const value={serverEnd,localEnd:Date.now()+Math.min(3600000,serverEnd-serverNow)-Math.max(0,roundTripMs/2)};
 deadlines.set(id,value);
 try{localStorage.setItem(prefix+id,JSON.stringify(value));}catch{/* Storage may be disabled. */}
 updates.dispatchEvent(new Event(id));
}

export function observeIdle(id:string,callback:()=>void){
 const storage=(event:StorageEvent)=>{if(event.key===prefix+id)callback();};
 updates.addEventListener(id,callback);
 window.addEventListener('storage',storage);
 return ()=>{
  updates.removeEventListener(id,callback);
  window.removeEventListener('storage',storage);
 };
}
