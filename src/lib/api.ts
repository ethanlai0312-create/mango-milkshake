import {authTransport,deadline} from './deadline';
import {createClient} from '@supabase/supabase-js';
import {resolveBackendUrl} from '../../shared/backend-url';
import {captureReadCacheScope,invalidateReadCache,rememberRead,isReadCacheAction} from './read-cache';
import {ApiError} from './api-error';
import {acceptIdleDeadline,isIdleExpired,markIdleExpired,sessionId,SESSION_EXPIRED} from './session-idle';
import {privateMediaUrl} from './media-url';
import {serializeApiRequest} from '../../shared/api-input';
export const supabaseUrl=resolveBackendUrl(import.meta.env.VITE_SUPABASE_URL,window.location.origin);
export const supabase=createClient(supabaseUrl,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{global:{fetch:authTransport(supabaseUrl+'/auth/v1',fetch.bind(globalThis))}});
let sessionRequest:ReturnType<typeof supabase.auth.getSession>|undefined;
export function readSession(){if(!sessionRequest)sessionRequest=deadline(supabase.auth.getSession().then(result=>{if(result.error)throw result.error;return result;}),12000,'登录状态检查超时，请重试；现有登录信息已保留。').finally(()=>{sessionRequest=undefined;});return sessionRequest;}
export let serverOffset=0;
const mutations=new Set(['updateAvatar','purgeAccount','login','register','bootstrap','settings','changePassword','userState','resetPassword','createInvite','revokeInvite','createExam','saveExam','submitReview','review','deleteExam','purgeExam','copyExam','startAttempt','saveAttempt','submitAttempt','grade','upload','renewUpload','verifyUpload','updateFile','replaceShared','deleteFile','createConversion','deleteConversion','cancelConversion','saveConfig']);
const inFlight=new Map<string,Promise<any>>();
const anonymousActions=new Set(['login','register','bootstrap']);
const downloadActions=new Set(['fileUrl','conversionDownload']);
const uploadActions=new Set(['upload','renewUpload']);
export async function api<T=any>(action:string,p:Record<string,any>={},expectedSession?:string):Promise<T>{
 const body=serializeApiRequest(action,p);
 const session=anonymousActions.has(action)?null:(await readSession()).data.session;
 const id=sessionId(session);
 if(expectedSession&&expectedSession!==id)throw new ApiError('请重新登录',401);
 if(id&&isIdleExpired(id)){markIdleExpired(id);throw new ApiError('请重新登录',401);}
 const cacheScope=captureReadCacheScope(session?.user.id);
 // Intent prefetch and page refresh share only an identical in-flight read, never a completed response.
 const key=mutations.has(action)&&!anonymousActions.has(action)?JSON.stringify([id,'write',action,p]):isReadCacheAction(action)?JSON.stringify([id,'read',cacheScope?.generation,action,p]):'';
 if(key&&inFlight.has(key))return inFlight.get(key)!;
 // Bound startup/read waits, while preserving existing long-running write/verification semantics.
 const controller=new AbortController();const timeoutMs=action==='me'?12000:(!mutations.has(action)||action==='login'||action==='register')?30000:0;
 const timeout=timeoutMs?setTimeout(()=>controller.abort(),timeoutMs):undefined;
 const request=(async()=>{
  const before=Date.now();
  const response=await fetch(supabaseUrl+'/functions/v1/api',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,...session?{Authorization:`Bearer ${session.access_token}`}:{ }},body});
  if(response.status===401||response.status===403)invalidateReadCache(session?.user.id);
  const payload=await response.json().catch(()=>{throw new ApiError(`服务暂不可用（${response.status}），请稍后重试`,response.status);});
  if(payload.server_time)serverOffset=Date.parse(payload.server_time)-(before+Date.now())/2;
  if(id&&response.status===401&&payload.code===SESSION_EXPIRED)markIdleExpired(id);
  if(!response.ok)throw new ApiError(payload.error??payload.message??`服务暂不可用（${response.status}），请重试`,response.status);
  if(id&&isIdleExpired(id))throw new ApiError('请重新登录',401);
  if(id&&payload.idle_expires_at&&payload.server_time)acceptIdleDeadline(id,payload,Date.now()-before);
  const result=payload.data??payload;
  const operation=downloadActions.has(action)?'download':uploadActions.has(action)?'upload':undefined;
  if(operation){
   const signedUrl=privateMediaUrl(result?.signedUrl,supabaseUrl,operation);
   if(!signedUrl)throw new ApiError('文件链接无效，请重试。',502);
   result.signedUrl=signedUrl;
  }
  if(mutations.has(action))invalidateReadCache(session?.user.id);else rememberRead(cacheScope,action,p,result);
  return result;
 })();
 if(key)inFlight.set(key,request);
 try{return await request;}catch(error){if(controller.signal.aborted)throw new Error(mutations.has(action)?'请求超时，结果尚未确认。请先检查记录，避免重复操作。':'账号服务响应超时，请重试。');throw error;}finally{clearTimeout(timeout);if(key&&inFlight.get(key)===request)inFlight.delete(key);}
}
export const serverNow=()=>Date.now()+serverOffset;
