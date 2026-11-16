export function deadline<T>(operation:Promise<T>,milliseconds:number,message:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>;
 return Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));
}

/** Bound only small Auth responses; Storage uploads and other SDK requests pass through unchanged. */
export function authTransport(authBase:string,fetcher:typeof fetch,milliseconds=8000):typeof fetch{
 const base=new URL(authBase),prefix=base.pathname.replace(/\/$/,'');
 return async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.origin!==base.origin||!(url.pathname===prefix||url.pathname.startsWith(prefix+'/')))return fetcher(input,init);
  const caller=init?.signal??(input instanceof Request?input.signal:null),controller=new AbortController();
  const cancel=()=>controller.abort(caller?.reason);
  if(caller?.aborted){cancel();throw caller.reason??new DOMException('Request aborted','AbortError');}
  caller?.addEventListener('abort',cancel,{once:true});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{const error=new DOMException('认证服务响应超时，请重试；登录信息已保留。','TimeoutError');controller.abort(error);reject(error);},milliseconds);});
   const request=(async()=>{
    const response=await fetcher(input,{...init,signal:controller.signal});
    // Auth SDK consumes JSON after fetch resolves. Include body transfer in the same deadline.
    const body=await response.arrayBuffer();
    return new Response([101,204,205,304].includes(response.status)?null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
   })();
   return await Promise.race([request,timeout]);
  }finally{clearTimeout(timer);caller?.removeEventListener('abort',cancel);}
 };
}
