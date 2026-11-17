import {createHash} from 'node:crypto';
import {createSessionVault,csrfAllowed,readCookie,sessionCookie,scrubSessionPayload} from './browser-session.mjs';
import {publicActionProblem,stripInternalResponseHeaders,hstsValue} from './ingress-policy.mjs';
export function createSessionBridge({upstreamOrigin,uploadGrants,rewriteUrl,fetcher=fetch,maxSessions=1000}){
 const vault=createSessionVault({maxSessions});
 const send=(res,status,data,extra={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin',...extra});res.end(JSON.stringify(data));};
 async function body(req,limit){let size=0;const parts=[];for await(const part of req.iterator({destroyOnReturn:false})){size+=part.length;if(size>limit){req.resume();throw Object.assign(Error('请求体超出限制'),{status:413});}parts.push(part);}try{return parts.length?JSON.parse(Buffer.concat(parts).toString()):{};}catch{throw Object.assign(Error('请求格式无效'),{status:400});}}
 async function handle(req,res,{path,origin,secure,client}){
  let entry=vault.get(readCookie(req.headers.cookie,secure));
  const baseHeaders=secure?{'Strict-Transport-Security':hstsValue()}:{};
  const clear=()=>{vault.discard(entry);entry=null;res.setHeader('Set-Cookie',sessionCookie('',secure,true));};
  async function upstream(pathname,method,payload,authorized=true){
   if(authorized&&entry){await vault.refresh(entry,async(refresh_token,apikey)=>{
    const r=await fetcher(upstreamOrigin+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'content-type':'application/json',apikey},body:JSON.stringify({refresh_token}),signal:AbortSignal.timeout(20000)});
    if(!r.ok){if([400,401,403].includes(r.status))clear();throw Object.assign(Error('登录已失效，请重新登录'),{status:r.status>=500?503:401});}return r.json();
   });}
   const headers={'content-type':'application/json',apikey:entry?.apikey??String(req.headers.apikey??''),'x-forwarded-for':client,'x-forwarded-proto':new URL(origin).protocol.slice(0,-1),'x-mango-device':createHash('sha256').update(entry?.id??client+'|'+String(req.headers['user-agent']??'')).digest('hex')};
   if(authorized&&entry)headers.authorization='Bearer '+entry.tokens.access_token;
   if(pathname==='/functions/v1/api'&&String(payload?.action).startsWith('worker'))headers.authorization=String(req.headers.authorization??'');
   return fetcher(upstreamOrigin+pathname,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(180000)});
  }
  try{
   const isApi=path==='/functions/v1/api',isSession=path==='/session';
   if(!isApi&&!isSession)return send(res,404,{error:'此认证接口不对外开放'},baseHeaders);
   if(isSession){
    if(!csrfAllowed(req.headers,origin))return send(res,403,{error:'请求来源不受支持'},baseHeaders);
    if(req.method==='GET'||req.method==='POST'){
     if(req.method==='POST')await body(req,1024);
     if(entry)await vault.refresh(entry,async(refresh_token,apikey)=>{const r=await fetcher(upstreamOrigin+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'content-type':'application/json',apikey},body:JSON.stringify({refresh_token}),signal:AbortSignal.timeout(20000)});if(!r.ok){if([400,401,403].includes(r.status))clear();throw Object.assign(Error('认证服务暂不可用，请重试'),{status:r.status>=500?503:401});}return r.json();},req.method==='POST');
     return send(res,200,{session:vault.metadata(entry)},baseHeaders);
    }
    if(req.method==='DELETE'){if(entry){try{await upstream('/auth/v1/logout?scope=local','POST',{});}finally{clear();}}else clear();res.writeHead(204,{'Cache-Control':'no-store',...baseHeaders});res.end();return;}
    return send(res,405,{error:'请求方法不受支持'},baseHeaders);
   }
   if(req.method!=='POST')return send(res,405,{error:'请求方法不受支持'},baseHeaders);
   if(String(req.headers['content-type']??'').split(';')[0]!=='application/json'||req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')return send(res,415,{error:'请求格式无效'},baseHeaders);
   const payload=await body(req,isApi?2000000:32768),action=payload?.action;
   const worker=isApi&&['workerClaim','workerFinish','workerHealth'].includes(action),anonymous=isApi&&['login','register','health','bootstrap'].includes(action);
   const blocked=isApi?publicActionProblem(action,req.headers.authorization):undefined;if(blocked)return send(res,blocked.status,{error:blocked.message},baseHeaders);
   if(!worker&&action!=='health'&&!csrfAllowed(req.headers,origin))return send(res,403,{error:'请求来源不受支持'},baseHeaders);
   if(!worker&&req.headers.authorization)return send(res,401,{error:'请刷新页面后重新登录',code:'SESSION_EXPIRED'},baseHeaders);
   if(!worker&&!anonymous&&!entry)return send(res,401,{error:'请重新登录',code:'SESSION_EXPIRED'},baseHeaders);
   if(!anonymous&&!worker&&req.headers['x-mango-session-id']&&req.headers['x-mango-session-id']!==entry?.info.session_id)return send(res,409,{error:'账号已变化，请重试',code:'SESSION_CHANGED'},baseHeaders);
   const response=await upstream(path,req.method,payload,!anonymous&&!worker);
   const headers=Object.fromEntries(response.headers);stripInternalResponseHeaders(headers);for(const key of ['content-encoding','content-length','transfer-encoding','connection','access-control-allow-origin','set-cookie'])delete headers[key];Object.assign(headers,baseHeaders,{'cache-control':'no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','referrer-policy':'no-referrer'});
   if(!worker&&!anonymous&&response.status===401)clear();
   if(!String(headers['content-type']).includes('application/json')){res.writeHead(response.status,headers);if(response.body){for await(const chunk of response.body){if(res.destroyed)break;if(!res.write(Buffer.from(chunk)))await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});}}res.end();return;}
   let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>16*1024*1024)throw Error('Upstream body limit');chunks.push(chunk);}
   let result=JSON.parse(Buffer.concat(chunks).toString());
   if(response.ok){
    uploadGrants.remember(result.data);
    const tokens=isApi&&['login','register'].includes(action)?result.session:isApi&&action==='changePassword'?result.data?.session:!isApi&&path.endsWith('/verify')?result:null;
    if(tokens){
     if(entry&&!entry.active)throw Object.assign(Error('Session changed'),{status:409});
     if(!['login','register'].includes(action)&&tokens.user?.id!==entry?.info.user.id)throw Error('Unexpected session user');
     entry=vault.adopt(tokens,String(req.headers.apikey??entry?.apikey??''),entry);res.setHeader('Set-Cookie',sessionCookie(entry.id,secure));
     if(isApi&&['login','register'].includes(action))result.session=vault.metadata(entry);else if(isApi)result.data.session=vault.metadata(entry);else result=vault.metadata(entry);
    }
    if(result.data?.signedUrl)result.data.signedUrl=rewriteUrl(result.data.signedUrl,origin);
   }
   result=scrubSessionPayload(result);
   return send(res,response.status,result,headers);
  }catch(error){if(!res.headersSent){const status=error.status??502;if(status===401)clear();return send(res,status,{error:status===413?'请求体超出限制':status===401?'请重新登录':'认证服务暂不可用，请稍后重试',...(status===401?{code:'SESSION_EXPIRED'}:{})},baseHeaders);}res.destroy();}
 }
 return {handle,vault};
}
