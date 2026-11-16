/** A warmed module is read synchronously; navigation never starts a new Suspense fallback. */
export function preloadedModule<T>(loader:()=>Promise<T>){
 type Snapshot={value?:T;error?:Error};
 let snapshot:Snapshot={},pending:Promise<T>|undefined;
 const listeners=new Set<()=>void>();
 const publish=(next:Snapshot)=>{snapshot=next;for(const listener of listeners)listener();};
 return {
  getSnapshot:()=>snapshot,
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  load():Promise<T>{
   if(snapshot.value!==undefined)return Promise.resolve(snapshot.value);
   if(pending)return pending;
   if(snapshot.error)publish({});
   const request=Promise.resolve().then(loader).then(value=>{publish({value});return value;},error=>{
    publish({error:error instanceof Error?error:new Error(String(error))});throw error;
   });
   pending=request;
   void request.then(()=>{if(pending===request)pending=undefined;},()=>{if(pending===request)pending=undefined;});
   return request;
  },
 };
}
