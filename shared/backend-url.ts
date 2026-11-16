/** Relative backend prefixes follow the site's origin on LAN/HTTPS deployments. */
export function resolveBackendUrl(configured:string,origin:string){
 const result=new URL(configured,origin);
 if(!['http:','https:'].includes(result.protocol)||result.username||result.password)throw new Error('后端地址无效');
 return result.href.replace(/\/$/,'');
}
