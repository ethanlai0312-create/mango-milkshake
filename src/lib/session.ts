import {api,readSession,supabase} from './api';
import {localLoad,localSave} from './offline';
import {idleEnd,isIdleExpired,markIdleExpired,sessionId} from './session-idle';
import {isAuthorizationError} from './api-error';

let signingOut:Promise<void>|undefined;
export const waitForIdleSignOut=()=>signingOut;
export function expireLocalSession(id:string){
 markIdleExpired(id);
 if(signingOut)return signingOut;
 signingOut=(async()=>{
  const {data:{session}}=await readSession();
  if(sessionId(session)===id)await supabase.auth.signOut({scope:'local'});
 })().catch(()=>{/* The expired marker blocks offline access even when Auth is unreachable. */})
 .finally(()=>{signingOut=undefined;});
 return signingOut;
}

export async function currentProfile(){
 const {data:{session}}=await readSession();
 if(!session)return null;
 const id=sessionId(session);
 if(!id)return null;
 if(isIdleExpired(id)){void expireLocalSession(id);return null;}
 const canRestoreOffline=()=>idleEnd(id)!==undefined&&!isIdleExpired(id);
 // OS network hints may be wrong with VPN adapters. Verify actual API reachability first.
 try{
  const profile=await api('me',{},id);
  if(isIdleExpired(id))return null;
  void localSave(profile.id,'profile',profile).catch(()=>{});
  return {profile,id};
 }catch(error){
  if(isIdleExpired(id)){void expireLocalSession(id);return null;}
  if(isAuthorizationError(error))throw error;
  // An online authorization failure must never fall back to a cached administrator role.
  if(canRestoreOffline()&&(!navigator.onLine||error instanceof TypeError)){const cached=await localLoad(session.user.id,'profile');if(cached&&!isIdleExpired(id))return {profile:cached,id};}
  throw error;
 }
}
