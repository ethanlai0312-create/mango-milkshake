/** Only the build's fixed, same-origin service-worker URL can enter this sink. */
export function trustedWorkerURL():string{
 const url=new URL(import.meta.env.BASE_URL+'sw.js',location.href);
 if(url.origin!==location.origin||url.search||url.hash||!url.pathname.endsWith('/sw.js'))throw new Error('Invalid worker URL');
 const tt=(window as unknown as {trustedTypes?:{createPolicy:(name:string,rules:{createScriptURL:(value:string)=>string})=>{createScriptURL:(value:string)=>unknown}}}).trustedTypes;
 if(!tt)return url.href;
 const policy=tt.createPolicy('mango-worker',{createScriptURL:value=>{if(value!==url.href)throw new Error('Untrusted worker URL');return value;}});
 return policy.createScriptURL(url.href) as string;
}
