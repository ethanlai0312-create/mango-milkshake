/** Transport decisions use only a validated canonical origin and an explicitly
 * trusted loopback tunnel. Forwarding headers from direct clients are ignored. */
export const isLoopback=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);

function validatedOrigin(value){
 try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)return;return url;}catch{return;}
}
function visitorProtocol(headers){
 const proto=headers['x-forwarded-proto'];
 if(proto!==undefined&&proto!=='http'&&proto!=='https')return;
 let visitor;
 if(headers['cf-visitor']!==undefined){
  try{const value=JSON.parse(headers['cf-visitor']);if(value?.scheme!=='http'&&value?.scheme!=='https')return;visitor=value.scheme;}catch{return;}
 }
 if(proto&&visitor&&proto!==visitor)return;
 return proto??visitor;
}

/** Call before reading a request body, proxying, cookies or authentication.
 * Local HTTP is a deliberate loopback-only test exception. HTTP writes never
 * redirect: redirecting a POST could replay credentials or side effects. */
export function transportDecision({encrypted=false,tunneled=false,remoteAddress,headers={},method='GET',rawUrl='/',origin,httpsPort,allowLoopbackHttp=true}){
 const target=validatedOrigin(origin);
 if(!target||typeof rawUrl!=='string'||!rawUrl.startsWith('/')||rawUrl.startsWith('//')||/[\\\r\n#]/u.test(rawUrl))return {status:400};
 if(encrypted)return {secure:true};
 if(tunneled){
  if(!isLoopback(remoteAddress)||target.protocol!=='https:')return {status:403};
  const protocol=visitorProtocol(headers);
  // A configured public Host alone does not prove that the visitor used TLS.
  if(protocol==='https')return {secure:true};
  if(protocol!=='http')return {status:403};
 }else if(isLoopback(remoteAddress)&&allowLoopbackHttp)return {secure:false,local:true};
 if(!['GET','HEAD'].includes(method))return {status:403};
 target.protocol='https:';
 if(!tunneled){if(!Number.isSafeInteger(httpsPort)||httpsPort<1||httpsPort>65535)return {status:503};target.port=httpsPort===443?'':String(httpsPort);}
 return {status:301,location:target.origin+rawUrl};
}

/** Preload is intentionally opt-in: every current/future subdomain must support
 * HTTPS, and sending this directive is not itself preload-list submission. */
export function hstsValue({preload=false}={}){return 'max-age=31536000; includeSubDomains'+(preload?'; preload':'');}

/** No runtime, proxy or upstream version diagnostics leave the application. */
export function stripInternalResponseHeaders(headers){
 for(const key of Object.keys(headers)){
  const normalized=key.toLowerCase();
  if(['server','via','server-timing','x-powered-by','x-runtime','x-upstream-service-time','x-supabase-api-version'].includes(normalized)||normalized.startsWith('x-envoy-')||normalized.startsWith('x-kong-'))delete headers[key];
 }
 return headers;
}

/** Shape-only gate before upstream calls. Backend still verifies worker keys.
 * The gateway cannot authenticate a key solely because its prefix looks valid. */
export function publicActionProblem(action,authorization=''){
 if(action==='bootstrap')return {status:404,message:'此接口不对外开放'};
 if(['workerClaim','workerFinish','workerHealth'].includes(action)){
  if(typeof authorization!=='string'||!/^Bearer mw_[A-Za-z0-9_-]{32,256}$/u.test(authorization))return {status:401,message:'需要工作器身份验证'};
 }
}
