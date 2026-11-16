import {useEffect,useState} from 'react';
import {readSession,supabaseUrl} from './api';
import {ApiError} from './api-error';
import {deadline} from './deadline';
import {invalidateReadCache} from './read-cache';
import {acceptIdleDeadline,isIdleExpired,markIdleExpired,sessionId,SESSION_EXPIRED} from './session-idle';
import {serializeApiRequest} from '../../shared/api-input';
import {PRESENCE_HEARTBEAT_MS,PRESENCE_TIMEOUT_SECONDS} from '../../shared/presence';

export type PresenceConnection='checking'|'connected'|'reconnecting'|'unavailable';
export const PRESENCE_REQUEST_TIMEOUT_MS=8000;

/** Heartbeats confirm server reachability; OS network hints can be wrong with VPNs. */
export function startAccountPresence(userId:string,publish:(status:PresenceConnection)=>void){
 const tab=crypto.randomUUID();let sequence=0,token='',stopped=false,inFlight=false,departed=false;
 let lastConfirmed:number|undefined,controller:AbortController|undefined;
 const headers=()=>({'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token});
 const stale=()=>lastConfirmed===undefined||Date.now()-lastConfirmed>PRESENCE_TIMEOUT_SECONDS*1000;
 const send=async(request:AbortController)=>{
  const {data:{session}}=await readSession();
  if(stopped||departed||request.signal.aborted)throw new DOMException('Presence cancelled','AbortError');
  if(!session||session.user.id!==userId)throw new ApiError('请重新登录',401);
  const id=sessionId(session);
  if(id&&isIdleExpired(id))throw new ApiError('请重新登录',401);
  token=session.access_token;
  const before=Date.now();
  const response=await fetch(supabaseUrl+'/functions/v1/api',{method:'POST',signal:request.signal,headers:headers(),body:serializeApiRequest('presence',{tab,sequence:++sequence,online:true})});
  if(response.status===401||response.status===403)invalidateReadCache(userId);
  const payload=await response.json();
  if(id&&response.status===401&&payload.code===SESSION_EXPIRED)markIdleExpired(id);
  if(!response.ok)throw new ApiError('在线状态暂时无法确认',response.status);
  if(payload.data?.ok!==true)throw new Error('在线状态响应无效');
  if(id&&isIdleExpired(id))throw new ApiError('请重新登录',401);
  // Presence never sends sessionActivity. This only records the existing server deadline.
  if(id&&payload.idle_expires_at&&payload.server_time)acceptIdleDeadline(id,payload,Date.now()-before);
 };
 const beat=async()=>{
  if(stopped||departed)return;
  if(lastConfirmed!==undefined&&stale())publish('reconnecting');
  if(inFlight)return;
  inFlight=true;const request=new AbortController();controller=request;
  try{
   await deadline(send(request),PRESENCE_REQUEST_TIMEOUT_MS,'在线状态检查超时');
   if(!stopped&&!departed){lastConfirmed=Date.now();publish('connected');}
  }catch{
   if(!stopped&&!departed)publish(stale()?'unavailable':'reconnecting');
  }finally{
   request.abort();if(controller===request)controller=undefined;inFlight=false;
  }
 };
 const leave=()=>{
  if(departed)return;
  departed=true;controller?.abort();
  if(!token)return;
  void fetch(supabaseUrl+'/functions/v1/api',{method:'POST',keepalive:true,headers:headers(),body:serializeApiRequest('presence',{tab,sequence:++sequence,online:false})}).catch(()=>{});
 };
 const awake=()=>{departed=false;void beat();};
 const visible=()=>{if(document.visibilityState==='visible')awake();};
 publish('checking');void beat();const timer=setInterval(()=>void beat(),PRESENCE_HEARTBEAT_MS);
 // Treat online/offline only as retry hints; neither proves API reachability.
 const events=['online','offline','pageshow','focus'];
 for(const event of events)window.addEventListener(event,awake);
 window.addEventListener('pagehide',leave);document.addEventListener('visibilitychange',visible);
 return()=>{
  stopped=true;clearInterval(timer);controller?.abort();
  for(const event of events)window.removeEventListener(event,awake);
  window.removeEventListener('pagehide',leave);document.removeEventListener('visibilitychange',visible);leave();
 };
}

export function useAccountPresence(userId:string|undefined):PresenceConnection{
 const [connection,setConnection]=useState<PresenceConnection>('checking');
 useEffect(()=>{
  setConnection('checking');
  if(userId)return startAccountPresence(userId,setConnection);
 },[userId]);
 return connection;
}
