const previews=new Map<string,string>();
export function rememberAvatarPreview(userId:string|undefined,fileId:string|undefined,url:string|undefined){
 if(!userId||!fileId||!url)return;
 previews.set(userId+':'+fileId,url);
}
export function avatarPreview(userId:string|undefined,fileId:string|undefined){
 if(!userId||!fileId)return '';
 return previews.get(userId+':'+fileId)??'';
}
