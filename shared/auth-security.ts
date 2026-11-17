/** Auth policy shared with tests; no credential, account directory or key is stored here. */
export const LOGIN_FAILURE_FLOOR_MS=650;
export const LOGIN_FAILURE_JITTER_MS=75;
/** The independent delay sample is selected before account lookup. */
export function loginFailureTarget(random:number){return LOGIN_FAILURE_FLOOR_MS+Math.floor(Math.max(0,Math.min(1,random))*LOGIN_FAILURE_JITTER_MS);}
export async function padLoginFailure(started:number,target:number,clock=()=>performance.now(),sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))){
 const remaining=Math.max(0,target-(clock()-started));if(remaining)await sleep(remaining);
}
export function inviteUsable(value:{revoked?:boolean;expires_at?:string;used?:number;max_uses?:number}|null|undefined,now=Date.now()){
 return !!value&&value.revoked===false&&typeof value.expires_at==='string'&&Date.parse(value.expires_at)>now&&Number.isSafeInteger(value.used)&&Number.isSafeInteger(value.max_uses)&&value.used!<value.max_uses!;
}
export function publicConfiguration(rows:readonly {key:string;value:unknown}[]){
 return rows.map(row=>row.key==='converter_url'?{...row,value:row.value?'已配置（地址仅保存在服务器）':''}:row);
}
export const retryAfterSeconds=(windowSeconds:number)=>String(Math.max(1,Math.min(3600,Math.ceil(windowSeconds))));
