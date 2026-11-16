/** Expiry hints only. Storage still verifies the actual signature and permissions. */
export function uploadTokenNeedsRenewal(token:string,now:number){
 try{const value=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return !Number.isFinite(value.exp)||value.exp*1000-now<30000;}catch{return true;}
}
