import type {SupabaseClient} from '@supabase/supabase-js';
/** Browser holds identity metadata only; the gateway owns access and refresh credentials. */
export function createCookieAuthClient(base:string,key:string){
 const listeners=new Set<(event:string,session:any)=>void>();let current:any=null,pending:Promise<any>|undefined,revision=0;
 const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('mango-cookie-auth'):undefined;
 try{for(const name of Object.keys(localStorage))if(/^sb-.*-auth-token(?:-code-verifier)?$/.test(name))localStorage.removeItem(name);}catch{/* Storage may be unavailable. Cookies still work. */}
 function emit(event:string){for(const callback of listeners)queueMicrotask(()=>callback(event,current));}
 async function send(path:string,method='GET',body?:unknown){
  const response=await fetch(base+path,{method,credentials:'same-origin',cache:'no-store',headers:{apikey:key,'X-Mango-Requested-With':'1',...(current?.session_id?{'X-Mango-Session-Id':current.session_id}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Object.assign(new Error(data.error??data.message??'认证服务暂不可用，请重试'),{status:response.status});}
  return response.status===204?null:response.json();
 }
 async function load(force=false){
  if(force){revision++;pending=undefined;}
  if(!pending){const requestRevision=revision;pending=send('/session').then(data=>{if(requestRevision!==revision)throw new Error('登录状态已变化，请重试');current=data?.session??null;return {data:{session:current},error:null};}).catch(error=>{if(requestRevision!==revision||error.status!==401)throw error;current=null;emit('SIGNED_OUT');return {data:{session:null},error:null};}).finally(()=>{if(requestRevision===revision)pending=undefined;});}return pending;
 }
 channel?.addEventListener('message',()=>{void load(true).then(()=>emit(current?'TOKEN_REFRESHED':'SIGNED_OUT')).catch(()=>{});});
 const auth={
  getSession:load,
  getUser:async()=>({data:{user:(await load()).data.session?.user??null},error:null}),
  setSession:async(_metadata:unknown)=>{const result=await load(true);emit('SIGNED_IN');channel?.postMessage('changed');return {...result,data:{...result.data,user:result.data.session?.user}};},
  refreshSession:async()=>{await send('/session','POST',{});const result=await load(true);emit('TOKEN_REFRESHED');return result;},
  onAuthStateChange:(callback:(event:string,session:any)=>void)=>{listeners.add(callback);return {data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}};},
  signOut:async()=>{try{await send('/session','DELETE');revision++;pending=undefined;current=null;emit('SIGNED_OUT');channel?.postMessage('changed');return {error:null};}catch(error){return {error};}},
 };
 return {auth} as unknown as SupabaseClient;
}
