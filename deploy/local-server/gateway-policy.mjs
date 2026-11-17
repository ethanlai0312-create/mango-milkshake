import {isIP} from 'node:net';

export const apiPath='/functions/v1/api';
const tusPath='/storage/v1/upload/resumable/sign';
const uploadPrefix='/storage/v1/object/upload/sign/mango-private/';
const downloadPrefix='/storage/v1/object/sign/mango-private/';
const authPrefix='/auth/v1/';
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const mfaFactorRoute=new RegExp('^'+authPrefix+'factors/'+uuid+'/(challenge|verify)$','i');
const objectPath=new RegExp('^'+uuid+'/(?:'+uuid+'|converted)/[^/]+$','iu');
const signature=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const jsonLimit=2_000_000;
const authLimit=32_768;
const chunkLimit=6*1024*1024;
const limits={api:jsonLimit,auth:authLimit,upload:chunkLimit,'tus-create':chunkLimit,'tus-chunk':chunkLimit};

function safeObjectPath(path,prefix){
 if(!path.startsWith(prefix))return false;
 try{
  const decoded=path.slice(prefix.length).split('/').map(decodeURIComponent);
  return decoded.every(part=>part!=='.'&&part!=='..'&&!/[\/\\\x00-\x1f\x7f]/u.test(part))
   && objectPath.test(decoded.join('/'));
 }catch{return false;}
}

export function backendRoute(path,query,method){
 if(path===apiPath&&method==='POST')return 'api';
 if(path===authPrefix+'user'&&method==='GET')return 'auth';
 if(path===authPrefix+'token'&&method==='POST'&&query.getAll('grant_type').length===1&&query.get('grant_type')==='refresh_token')return 'auth';
 if(method==='POST'&&(path===authPrefix+'logout'||path===authPrefix+'factors'||mfaFactorRoute.test(path)))return 'auth';
 if(method==='PUT'&&safeObjectPath(path,uploadPrefix)&&query.getAll('token').length===1&&signature.test(query.get('token')))return 'upload';
 if(['GET','HEAD'].includes(method)&&safeObjectPath(path,downloadPrefix)&&query.getAll('token').length===1&&signature.test(query.get('token')))return 'download';
 if(path===tusPath&&method==='POST')return 'tus-create';
 if(path.startsWith(tusPath+'/')&&/^[A-Za-z0-9_-]{1,1500}$/u.test(path.slice(tusPath.length+1))){
  if(method==='HEAD')return 'tus-head';
  if(method==='PATCH')return 'tus-chunk';
 }
}

const mime=headers=>String(headers['content-type']??'').split(';',1)[0].trim().toLowerCase();
function integer(value){
 if(typeof value!=='string'||!/^\d{1,16}$/u.test(value))return undefined;
 const number=Number(value);
 return Number.isSafeInteger(number)?number:undefined;
}

export function requestProblem(route,headers,method='POST'){
 const limit=limits[route];
 const length=integer(headers['content-length']);
 if(headers['content-length']!==undefined&&length===undefined)return 400;
 if(limit!==undefined&&length!==undefined&&length>limit)return 413;
 if(route==='auth'&&method==='GET')return length>0?400:null;
 if(['api','auth'].includes(route)&&
  (route==='api'||length>0||headers['transfer-encoding'])&&mime(headers)!=='application/json')return 415;
 if(route==='upload'&&(length===undefined||length<1))return 411;
 if(route.startsWith('tus-')){
  if(headers['tus-resumable']!=='1.0.0'||!signature.test(String(headers['x-signature']??'')))return 400;
  if(headers['upload-defer-length']!==undefined||headers['upload-concat']!==undefined)return 400;
  if(route==='tus-create'&&((integer(headers['upload-length'])??0)<1||typeof headers['upload-metadata']!=='string'))return 400;
  if(route==='tus-chunk'&&(integer(headers['upload-offset'])===undefined||!length))return 400;
  if((route==='tus-chunk'||route==='tus-create'&&(length>0||headers['transfer-encoding']))&&mime(headers)!=='application/offset+octet-stream')return 415;
 }
 if(headers['content-encoding']&&headers['content-encoding']!=='identity')return 415;
 return null;
}

export function requestLimit(route){return limits[route];}

export const cspEnforced=[
 "default-src 'none'","base-uri 'none'","object-src 'none'","frame-ancestors 'none'",
 "frame-src 'none'","form-action 'self'","script-src 'self'","script-src-attr 'none'",
 "style-src 'self' 'unsafe-inline'",
 "img-src 'self' https: data: blob:","media-src 'self' blob:",
 "font-src 'self'","connect-src 'self'","worker-src 'self'",
 "require-trusted-types-for 'script'","trusted-types dompurify mango-worker","report-uri /_csp_report",
].join('; ');

const disabledFeatures=['camera','microphone','geolocation','display-capture','payment','usb','serial','hid','bluetooth','midi','xr-spatial-tracking'];
const permissionsPolicy=disabledFeatures.map(feature=>`${feature}=()`).join(', ');

export function staticBrowserHeaders(asset){
 const headers={
  'X-Content-Type-Options':'nosniff',
  'Cross-Origin-Resource-Policy':'same-origin',
  'Referrer-Policy':'no-referrer',
 };
 if(asset==='/index.html')Object.assign(headers,{
  // The shell contains no private records. Revalidate it and forbid edge HTML
  // transformations, including automatic analytics script injection.
  'Cache-Control':'public, no-cache, no-transform',
  'X-Frame-Options':'DENY',
  'Cross-Origin-Opener-Policy':'same-origin',
  'Permissions-Policy':permissionsPolicy,
  'Content-Security-Policy':cspEnforced,
 });
 if(asset==='/sw.js')headers['Content-Security-Policy']="default-src 'none'; script-src 'self'; connect-src 'self'";
 if(asset==='/.well-known/security.txt')Object.assign(headers,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600, no-transform'});
 return headers;
}

export function allowsBrowserRequest(route,headers){
 // Other clients and older browsers may omit Fetch Metadata. Authentication and
 // the exact Origin check still apply independently of these browser hints.
 if(!['cross-site','same-site'].includes(headers['sec-fetch-site']))return true;
 return route==='download'&&headers['sec-fetch-mode']==='navigate'&&headers['sec-fetch-dest']==='document';
}

export function validClientAddress(value){return typeof value==='string'&&isIP(value)!==0?value:undefined;}

export function publicStaticFile(path){
 if(path==='/'||path==='/index.html')return '/index.html';
 if(path==='/.well-known/security.txt')return path;
 if(path==='/sw.js')return path;
 if(/^\/assets\/[A-Za-z0-9_-]+\.(?:js|css|woff2?|ttf|svg|png|ico)$/u.test(path))return path;
}

export function hardenDownload(headers){
 const type=mime(headers);
 const inline=/^(?:image\/(?:png|jpeg|webp|gif|bmp|avif|heic|heif|tiff)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf|text\/plain)$/u.test(type);
 headers['cross-origin-resource-policy']='same-origin';
 headers['referrer-policy']='no-referrer';
 headers['x-content-type-options']='nosniff';
 headers['content-security-policy']="sandbox; default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
 if(!inline){
  headers['content-type']='application/octet-stream';
  if(!/^attachment(?:;|$)/iu.test(String(headers['content-disposition']??'')))headers['content-disposition']='attachment';
 }
}
