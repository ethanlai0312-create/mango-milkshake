const uploadPrefix='/storage/v1/object/upload/sign/mango-private/';
const tusPrefix='/storage/v1/upload/resumable/sign/';
const chunkSize=6*1024*1024;

function metadata(value){
 const fields=new Map();
 for(const part of String(value??'').split(',')){
  const [key,encoded,...extra]=part.trim().split(' ');
  if(!key||!encoded||extra.length||fields.has(key))return;
  fields.set(key,Buffer.from(encoded,'base64').toString('utf8'));
 }
 return fields;
}
function safeInteger(value){
 if(!/^\d{1,16}$/u.test(String(value??'')))return;
 const number=Number(value);
 return Number.isSafeInteger(number)?number:undefined;
}
function resourcePath(value){
 try{
  const url=new URL(value,'http://upload.invalid');
  if(url.search||url.hash||!url.pathname.startsWith(tusPrefix)||
   !/^[A-Za-z0-9_-]{1,1500}$/u.test(url.pathname.slice(tusPrefix.length)))return;
  return url.pathname;
 }catch{return;}
}

/** Grants originate only in successful application API responses from the trusted upstream. */
export function createUploadGrants(now=Date.now,capacity=4096){
 const tickets=new Map(),files=new Map();
 function prune(){
  for(const [token,grant] of tickets)if(grant.expires<=now())tickets.delete(token);
  for(const [path,file] of files)if(file.expires<=now())files.delete(path);
 }
 function remember(data){
  if(!data?.signedUrl)return;
  const signed=new URL(data.signedUrl,'http://upload.invalid');
  if(!signed.pathname.startsWith(uploadPrefix))return;
  const path=decodeURIComponent(signed.pathname.slice(uploadPrefix.length));
  const token=signed.searchParams.get('token');
  if(!token||token!==data.token||data.file?.path!==path||
   !Number.isSafeInteger(data.file.size)||data.file.size<1)throw Error('Invalid upload grant');
  const claim=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  if(!Number.isSafeInteger(claim.exp)||claim.exp*1000<=now())throw Error('Expired upload grant');
  const expires=Math.min(claim.exp*1000,now()+86400000);
  prune();
  let file=files.get(path);
  if(file&&file.size!==data.file.size)throw Error('Upload size changed');
  if(!file){
   // Preserve the one-resource binding while any ticket for this object is live.
   if(files.size>=capacity)throw Error('Upload grant capacity reached');
   file={path,size:data.file.size,expires,creating:false,resource:undefined};
   files.set(path,file);
  }
  file.expires=Math.max(file.expires,expires);
  if(tickets.size>=capacity&&!tickets.has(token))tickets.delete(tickets.keys().next().value);
  tickets.set(token,{file,expires});
 }
 function begin(route,path,query,headers){
  if(!['upload','tus-create','tus-head','tus-chunk'].includes(route))return {};
  prune();
  const token=route==='upload'?query.get('token'):headers['x-signature'];
  const grant=tickets.get(token);
  if(!grant)return {status:route==='tus-head'?423:409,renew:true};
  const {file}=grant,length=safeInteger(headers['content-length']);
  if(route==='upload'){
   if(decodeURIComponent(path.slice(uploadPrefix.length))!==file.path||length!==file.size)return {status:413};
   return {};
  }
  if(route==='tus-create'){
   const fields=metadata(headers['upload-metadata']);
   if(safeInteger(headers['upload-length'])!==file.size||
    fields?.get('bucketName')!=='mango-private'||fields.get('objectName')!==file.path)return {status:413};
   if(file.resource)return {status:409,resume:file.resource};
   if(file.creating)return {status:503};
   if(length!==undefined&&length>Math.min(file.size,chunkSize))return {status:413};
   file.creating=true;
  }else{
   if(file.resource&&path!==file.resource)return {status:409};
   if(route==='tus-chunk'){
    if(!file.resource)return {status:409,renew:true};
    const offset=safeInteger(headers['upload-offset']);
    if(offset===undefined||length===undefined||offset+length>file.size)return {status:413};
   }
  }
  return {
   limit:route==='tus-create'?Math.min(file.size,chunkSize):undefined,
   release(){if(route==='tus-create')file.creating=false;},
   finish(response,status){
    if(status<200||status>=300)return true;
    if(route==='tus-head'){
     const fields=metadata(response['upload-metadata']);
     if(safeInteger(response['upload-length'])!==file.size||
      fields?.get('bucketName')!=='mango-private'||fields.get('objectName')!==file.path)return false;
     file.resource=path;
    }
    if(route==='tus-create'){
     const resource=resourcePath(response.location);
     if(!resource)return false;
     file.resource=resource;
    }
    const offset=safeInteger(response['upload-offset']);
    return offset===undefined||offset<=file.size;
   },
  };
 }
 return {remember,begin};
}
