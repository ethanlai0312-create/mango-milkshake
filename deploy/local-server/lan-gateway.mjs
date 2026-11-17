// Windows gateway: only the app, Auth and private Storage reach LAN clients.
import http from 'node:http';
import {createSessionBridge} from './session-bridge.mjs';
import {transportDecision,hstsValue,stripInternalResponseHeaders} from './ingress-policy.mjs';
import https from 'node:https';
import {timingSafeEqual} from 'node:crypto';
import {readFile,realpath,stat,statfs} from 'node:fs/promises';
import {createReadStream,watchFile} from 'node:fs';
import {resolve,sep} from 'node:path';
import {Transform} from 'node:stream';
import {createIngressBudget} from './ingress-budget.mjs';
import {createUploadGrants} from './upload-grants.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {allowsBrowserRequest,apiPath,backendRoute,hardenDownload,publicStaticFile,requestLimit,requestProblem,staticBrowserHeaders,validClientAddress} from './gateway-policy.mjs';
const config=JSON.parse(await readFile(new URL('./lan-config.json',import.meta.url),'utf8'));
const relaySecret=config.relaySecretFile?(await readFile(config.relaySecretFile,'utf8')).trim():null;
const relayOrigin=config.relayOrigin?new URL(config.relayOrigin):null;
if(relayOrigin&&relayOrigin.href!=='https://study.example.com/')throw Error('Unexpected fixed domain origin');
function validRelay(req){const value=String(req.headers['x-mango-relay-key']??'');return !!relaySecret&&/^[a-f0-9]{64}$/.test(value)&&value.length===relaySecret.length&&timingSafeEqual(Buffer.from(value),Buffer.from(relaySecret));}
const upstreamOrigin=new URL(config.upstreamOrigin??'http://127.0.0.1:58000');
if(!['http://127.0.0.1:15800','http://127.0.0.1:58000','http://api-gw:8000'].includes(upstreamOrigin.origin))throw Error('Unexpected API upstream');
const dist=resolve(config.dist),hosts=new Set(config.hosts.map(s=>s.toLowerCase()));
const realDist=await realpath(dist);
let publicOrigin=config.publicOrigin?new URL(config.publicOrigin):null;
const execute=promisify(execFile);
let storageCheck,storageCheckAt=0;
function storageAvailable(){
 if(!storageCheck||Date.now()-storageCheckAt>=10000){
  storageCheckAt=Date.now();
  storageCheck=execute('C:/Program Files/WSL/wsl.exe',[
   '-d','MangoLocal','--exec','/usr/bin/df','-B1','--output=avail','/',
  ],{windowsHide:true,timeout:3000,maxBuffer:1024}).then(({stdout})=>{
   const available=stdout.trim().split(/\s+/).at(-1);
   if(!/^\d+$/.test(available??''))throw Error('Unexpected filesystem response');
   return BigInt(available);
  });
 }
 return storageCheck;
}
const fixedTunnelOrigin=config.fixedTunnelOrigin?new URL(config.fixedTunnelOrigin):null;
if(fixedTunnelOrigin&&fixedTunnelOrigin.href!=='https://study.example.com/')throw Error('Unexpected named tunnel origin');
if(publicOrigin&&(publicOrigin.protocol!=='https:'||publicOrigin.username||publicOrigin.password||publicOrigin.pathname!=='/'))throw Error('Invalid public origin');
watchFile(new URL('./lan-config.json',import.meta.url),{interval:2000},async()=>{
 try{const updated=JSON.parse(await readFile(new URL('./lan-config.json',import.meta.url),'utf8'));const value=updated.publicOrigin?new URL(updated.publicOrigin):null;
  if(value&&(value.protocol!=='https:'||value.username||value.password||value.pathname!=='/'))return;
  publicOrigin=value;
 }catch{console.error('Public origin configuration update rejected');}
});
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff2','.woff2':'font/woff2','.ttf':'font/ttf','.ico':'image/x-icon'};
const hop=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
const localAddress=address=>address==='127.0.0.1'||address==='::1'||address==='::ffff:127.0.0.1';
const consumeIngress=createIngressBudget();
const uploadGrants=createUploadGrants();
const browserSessions=createSessionBridge({upstreamOrigin:upstreamOrigin.origin,uploadGrants,rewriteUrl});
function admit(req,res,route,tunneled){
 const client=tunneled?validClientAddress(validRelay(req)?req.headers['x-mango-client-ip']:req.headers['cf-connecting-ip']):undefined;
 const budget=consumeIngress(route,client??req.socket.remoteAddress??'unknown');
 if(budget.status){
  res.setHeader('Retry-After',String(budget.retry));
  fail(res,budget.status,'服务请求较多，请稍后重试');
  return false;
 }
 res.once('close',budget.release);
 return true;
}
function clientAllowed(address){const ip=(address??'').replace(/^::ffff:/,'');return localAddress(ip)||ip.startsWith(config.remotePrefix)&&/^\d+$/.test(ip.slice(config.remotePrefix.length));}
function fail(res,status,message){if(!res.headersSent){const json=res.req?.url?.startsWith('/backend/');res.writeHead(status,{'Content-Type':json?'application/json; charset=utf-8':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(json?JSON.stringify({error:message,message,code:'gateway_request_failed'}):message);}else res.destroy();}
const reportDirectives=new Set(['require-trusted-types-for']);
let reportWindow=0,reportedDirectives=new Set();
async function receiveCspReport(req,res){
 if(req.method!=='POST')return fail(res,405,'只支持POST');
 if(req.headers['content-type']?.split(';')[0]!=='application/csp-report')return fail(res,415,'请求格式无效');
 const parts=[];let size=0;
 for await(const chunk of req.iterator({destroyOnReturn:false})){
  size+=chunk.length;
  if(size>4096){req.resume();return fail(res,413,'请求体超出限制');}
  parts.push(chunk);
 }
 let report;
 try{report=JSON.parse(Buffer.concat(parts));}catch{return fail(res,400,'请求格式无效');}
 const minute=Math.floor(Date.now()/60000);
 if(minute!==reportWindow){reportWindow=minute;reportedDirectives=new Set();}
 const directive=report?.['csp-report']?.['effective-directive'];
 if(reportDirectives.has(directive)&&!reportedDirectives.has(directive)){
  reportedDirectives.add(directive);
  // Keep paths, query strings and the report sample out of the log.
  console.warn('CSP report-only directive:',directive);
 }
 res.writeHead(204,{'Cache-Control':'no-store'});res.end();
}
function rewriteUrl(value,origin){
 const parsed=new URL(value,upstreamOrigin);
 const allowed=new Set([upstreamOrigin.origin,'http://127.0.0.1:58000','http://api-gw:8000']);
 if(!allowed.has(parsed.origin)||parsed.username||parsed.password||parsed.hash)throw Error('Unexpected backend redirect');
 if(!['GET','PUT','PATCH'].some(method=>backendRoute(parsed.pathname,parsed.searchParams,method)))throw Error('Unexpected storage path');
 return origin+'/backend'+parsed.pathname+parsed.search;
}
async function proxy(req,res,origin,target,tunneled=false){
 const path=target.pathname.slice('/backend'.length);
 if(path==='/session'||path==='/functions/v1/api'||path.startsWith('/auth/v1/')){
  if(req.headers.origin&&req.headers.origin!==origin)return fail(res,403,'请求来源不受支持');
  if(!admit(req,res,path==='/functions/v1/api'?'api':'auth',tunneled))return;
  const client=tunneled?validClientAddress(validRelay(req)?req.headers['x-mango-client-ip']:req.headers['cf-connecting-ip']):undefined;
  return browserSessions.handle(req,res,{path,origin,secure:new URL(origin).protocol==='https:',client:client??req.socket.remoteAddress??'unknown'});
 }
 const route=backendRoute(path,target.searchParams,req.method);
 if(!route)return fail(res,404,'此后端接口不对外开放');
 if(!allowsBrowserRequest(route,req.headers))return fail(res,403,'请求来源不受支持');
 if(req.headers.origin&&req.headers.origin!==origin)return fail(res,403,'请求来源不受支持');
 const problem=requestProblem(route,req.headers,req.method);
 if(problem)return fail(res,problem,'请求格式无效或请求体超出限制');
 const upload=uploadGrants.begin(route,path,target.searchParams,req.headers);
 if(upload.status){
  if(upload.renew)res.setHeader('X-Mango-Upload-Renew','1');
  if(upload.resume)res.setHeader('X-Mango-Upload-Resume','/backend'+upload.resume);
  if(upload.status===503)res.setHeader('Retry-After','2');
  return fail(res,upload.status,'上传预约已变化，请重试或重新取得上传凭据');
 }
 res.once('close',()=>upload.release?.());
 if(!admit(req,res,route,tunneled))return;
 if(['upload','tus-create','tus-chunk'].includes(route)){
  try{
   const disk=await statfs(dist,{bigint:true});
   const threshold=20n*1024n**3n;
   if(disk.bavail*disk.bsize<threshold||process.platform==='win32'&&await storageAvailable()<threshold)
    return fail(res,507,'服务器可用磁盘不足，请稍后上传');
  }catch{return fail(res,503,'暂时无法检查服务器可用空间');}
 }
 const headers=Object.fromEntries(Object.entries(req.headers).filter(([key])=>!hop.has(key)
  &&!key.startsWith('x-mango-')&&!key.startsWith('oai-')&&!key.startsWith('x-forwarded-')
  &&!key.startsWith('cf-')&&!['forwarded','cookie','x-real-ip','x-upsert'].includes(key)));
 headers.host=upstreamOrigin.host;headers['accept-encoding']='identity';
 // Only the loopback tunnel may supply Cloudflare's client address.
 const client=tunneled?validClientAddress(validRelay(req)?req.headers['x-mango-client-ip']:req.headers['cf-connecting-ip']):undefined;
 headers['x-forwarded-for']=client??req.socket.remoteAddress;headers['x-forwarded-proto']=new URL(origin).protocol.slice(0,-1);
 const upstream=http.request({hostname:upstreamOrigin.hostname,port:upstreamOrigin.port,path:path+target.search,method:req.method,headers},response=>{
  const out=Object.fromEntries(Object.entries(response.headers).filter(([key])=>!hop.has(key)));
  stripInternalResponseHeaders(out);
  if(new URL(origin).protocol==='https:')out['strict-transport-security']=hstsValue();
  delete out['access-control-allow-origin'];
  out['cache-control']='no-store';out['x-content-type-options']='nosniff';
  out['cross-origin-resource-policy']='same-origin';out['referrer-policy']='no-referrer';
  if(upload.finish&&!upload.finish(out,response.statusCode??502)){response.destroy();return fail(res,409,'上传状态与预约不一致，请重新上传');}
  try{if(out.location)out.location=rewriteUrl(String(out.location),origin);}catch{response.destroy();return fail(res,502,'后端返回了无效的跳转地址');}
  if(route==='download'&&response.statusCode>=200&&response.statusCode<300)hardenDownload(out);
  response.on('error',()=>fail(res,502,'后端连接中断，请稍后重试'));
  const isApi=route==='api'&&String(out['content-type']).includes('application/json');
  if(!isApi){res.writeHead(response.statusCode??502,out);response.pipe(res);return;}
  let size=0;const chunks=[];
  response.on('data',chunk=>{size+=chunk.length;if(size>16*1024*1024){response.destroy();fail(res,502,'API响应超出处理能力');}else chunks.push(chunk);});
  response.on('end',()=>{
   if(res.destroyed||res.writableEnded)return;
   try{const data=JSON.parse(Buffer.concat(chunks).toString());if(response.statusCode>=200&&response.statusCode<300)uploadGrants.remember(data.data);if(data.data?.signedUrl)data.data.signedUrl=rewriteUrl(data.data.signedUrl,origin);const body=Buffer.from(JSON.stringify(data));out['content-length']=body.length;res.writeHead(response.statusCode??502,out);res.end(body);}
   catch{fail(res,502,'后端返回格式无效，请稍后重试');}
  });
 });
 upstream.setTimeout(180000,()=>upstream.destroy());
 upstream.on('error',()=>fail(res,502,'本机后端尚未就绪，请稍后重试'));
 req.on('aborted',()=>upstream.destroy());res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});
 const limit=upload.limit??requestLimit(route);
 if(limit===undefined||req.headers['content-length']!==undefined){req.pipe(upstream);return;}
 let received=0;
 const bound=new Transform({transform(chunk,_encoding,done){
  received+=chunk.length;
  if(received>limit)done(new Error('Request body limit exceeded'));
  else done(null,chunk);
 }});
 bound.once('error',()=>{req.unpipe(bound);req.resume();fail(res,413,'请求体超出限制');upstream.destroy();});
 req.pipe(bound).pipe(upstream);
}
async function serve(req,res,secure){
 if(!clientAllowed(req.socket.remoteAddress))return fail(res,403,'仅允许本机和指定局域网访问');
 const rawPath=req.url?.split('?',1)[0];
 if(!rawPath?.startsWith('/')||rawPath.startsWith('//')||rawPath.includes('\\')||rawPath.includes('#'))return fail(res,400,'请求地址无效');
 const tunnelOrigin=localAddress(req.socket.remoteAddress)?[publicOrigin,fixedTunnelOrigin].find(value=>value&&String(req.headers.host).toLowerCase()===value.host):null;
 const tunneled=!!tunnelOrigin;
 const effectiveOrigin=tunneled&&relayOrigin&&validRelay(req)?relayOrigin:tunnelOrigin;
 let target;try{target=tunneled?new URL(req.url,effectiveOrigin):new URL((secure?'https://':'http://')+req.headers.host+req.url);}catch{return fail(res,400,'请求地址无效');}
 if(!tunneled&&(!hosts.has(target.hostname.toLowerCase())||target.username||target.password||Number(target.port||(secure?443:80))!==req.socket.localPort))return fail(res,421,'未配置此访问主机名或端口');
 const origin=target.origin,path=target.pathname;
 if(rawPath!==path)return fail(res,400,'请求地址无效');
 const decision=transportDecision({encrypted:secure,tunneled,remoteAddress:req.socket.remoteAddress,headers:req.headers,method:req.method,rawUrl:req.url,origin,httpsPort:config.httpsPort});
 if(decision.status){if(decision.location){res.writeHead(decision.status,{Location:decision.location,'Cache-Control':'no-store'});res.end();return;}return fail(res,decision.status,'请使用HTTPS访问');}
 if(decision.secure&&tunneled)res.setHeader('Strict-Transport-Security',hstsValue());
 if(path==='/_local_health'){
  if(tunneled||!localAddress(req.socket.remoteAddress))return fail(res,404,'文件不存在');
  if(req.method!=='GET')return fail(res,405,'只支持读取');
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({service:'mango-local-static',mode:'lan-gateway',https:secure,http_port:config.httpPort,https_port:config.httpsPort}));return;
 }
 if(path==='/_api_health'&&req.method==='GET'){
  if(!admit(req,res,'health',tunneled))return;
  try{const response=await fetch(upstreamOrigin.origin+apiPath,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'health'}),signal:AbortSignal.timeout(8000)});const body=await response.json();res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:body.ok===true}));}catch{fail(res,502,'本机后端尚未就绪');}return;
 }
 if(path==='/_csp_report'){if(admit(req,res,'report',tunneled))return receiveCspReport(req,res);return;}
 if(path==='/_server_certificate.cer'){
  if(tunneled||!config.certificatePublic)return fail(res,404,'外网入口使用公开受信任证书');
  if(!['GET','HEAD'].includes(req.method))return fail(res,405,'只支持读取');
  res.writeHead(200,{'Content-Type':'application/pkix-cert','Content-Disposition':'attachment; filename="MangoStudy-LAN.cer"','Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else createReadStream(config.certificatePublic).pipe(res);return;
 }
 if(path==='/_connection_test'){
  if(tunneled)return fail(res,404,'文件不存在');
  if(req.method!=='GET')return fail(res,405,'只支持读取');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>芒果学社连接检查</title><style>body{font:16px system-ui;max-width:760px;padding:24px;margin:auto;line-height:1.8}code{overflow-wrap:anywhere}a{display:block;margin:18px 0}</style><h1>芒果学社连接检查</h1><p>已连接到这台电脑的网站入口。</p><p id="secure"></p><p id="api">正在检查本机后端…</p><a href="${tunneled?origin:`https://${target.hostname}:${config.httpsPort}`}/">打开 HTTPS 学习平台</a>${tunneled?'':'<a href="/_server_certificate.cer">下载本次局域网测试的公钥证书</a>'}<p>${tunneled?'此入口使用外网HTTPS证书。网站业务数据仍需要账号登录。':'这是自签名局域网测试证书。浏览器可能要求由你本人确认或安装信任。下载的文件仅包含公钥，不包含服务器私钥。'}</p><script>document.getElementById('secure').textContent='浏览器安全上下文：'+window.isSecureContext;fetch('/_api_health').then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{document.getElementById('api').textContent=d.ok?'本机数据库/API入口正常':'后端响应异常'}).catch(()=>{document.getElementById('api').textContent='后端尚未连接，请记录此结果';});</script></html>`);return;
 }
 // Keep HTTP loopback compatible. LAN users use TLS for passwords and secure browser APIs.

 if(path.startsWith('/backend/'))return proxy(req,res,origin,target,tunneled);
 if(!['GET','HEAD'].includes(req.method))return fail(res,405,'只支持GET/HEAD');
 const asset=publicStaticFile(path);
 if(!asset)return fail(res,404,'文件不存在');
 if(!admit(req,res,'static',tunneled))return;
 try{
  const file=await realpath(resolve(realDist,'.'+asset));
  if(!file.startsWith(realDist+sep))return fail(res,404,'文件不存在');
  const info=await stat(file);if(!info.isFile())return fail(res,404,'文件不存在');
  const extension=file.slice(file.lastIndexOf('.'));res.writeHead(200,{'Content-Type':types[extension]??'application/octet-stream','Content-Length':info.size,'Cache-Control':path.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache',...staticBrowserHeaders(asset)});
  if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch{fail(res,404,'文件不存在');}
}
const options=config.httpsPort?{pfx:await readFile(config.pfx),passphrase:(await readFile(config.pfxPassword,'utf8')).trim(),minVersion:'TLSv1.2'}:null;
const listeners=[[false,config.httpPort],...(config.httpsPort?[[true,config.httpsPort]]:[])];
for(const [secure,port] of listeners){
 const handler=(req,res)=>{void serve(req,res,secure).catch(()=>fail(res,500,'本机入口异常，请检查服务状态'));};
 const server=secure?https.createServer(options,handler):http.createServer(handler);
 server.requestTimeout=60000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 server.maxConnections=256;
 server.on('clientError',(_err,socket)=>{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
 server.on('error',error=>{console.error('Gateway listener failed',error.code);process.exitCode=1;});
 server.listen(port,config.bindAddress??'0.0.0.0',()=>console.log(`Mango gateway ${secure?'HTTPS':'HTTP'} ready on ${server.address().port}; restricted to configured peers and loopback`));
}
