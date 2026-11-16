export type DialogRequest={kind:'confirm'|'prompt'|'alert';message:string;initial:string;resolve:(value:any)=>void};
const queue:DialogRequest[]=[];
let listener:((request:DialogRequest)=>void)|undefined;
let active=false;
export const sessionOverlays=new EventTarget();
export function resetSessionOverlays(){
 for(const item of queue.splice(0))item.resolve(item.kind==='prompt'?null:false);
 sessionOverlays.dispatchEvent(new Event('reset'));
}
function next(){if(!active&&listener&&queue.length){active=true;listener(queue.shift()!);}}
export function subscribeDialogs(callback:(request:DialogRequest)=>void){listener=callback;next();return()=>{listener=undefined;};}
export function finishDialog(){active=false;next();}
function request(kind:DialogRequest['kind'],message:string,initial=''){return new Promise<any>(resolve=>{queue.push({kind,message,initial,resolve});next();});}
export const confirmAction=(message:string):Promise<boolean>=>request('confirm',message);
export const promptText=(message:string,initial=''):Promise<string|null>=>request('prompt',message,initial);
export const showMessage=(message:string):Promise<void>=>request('alert',message);
