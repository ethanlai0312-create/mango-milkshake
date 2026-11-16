/** Signed file links may only point at the app's configured private storage. */
export function privateMediaUrl(value:unknown,backendUrl:string,operation:'download'|'upload'):string|undefined{
 if(typeof value!=='string')return;
 const base=new URL(backendUrl);
 const prefix=base.pathname.replace(/\/$/,'')+'/storage/v1/object/'+(operation==='upload'?'upload/':'')+'sign/mango-private/';
 try{
  const url=new URL(value);
  const tokens=url.searchParams.getAll('token');
  if(url.origin!==base.origin||url.username||url.password||url.hash||
   !url.pathname.startsWith(prefix)||url.pathname===prefix||tokens.length!==1||!tokens[0])return;
  const parts=url.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
  if(parts.some(part=>!part||part==='.'||part==='..'||/[\/\\\x00-\x1f\x7f]/u.test(part)))return;
  return url.href;
 }catch{return undefined;}
}

export function externalImageUrl(value:string):URL|undefined{
 try{
  const url=new URL(value);
  if(url.protocol==='https:'&&!url.username&&!url.password)return url;
 }catch{return undefined;}
}
