import {useCallback,useState,type SetStateAction} from 'react';
import {peekRead,getReadCacheAccount} from '../lib/read-cache';
import {isAuthorizationError} from '../lib/api-error';

/** A previous authorized read is a display seed; callers always refresh through api(). */
export function useCachedPage<T>(action:string,params:Record<string,unknown>,empty:T,initial?:T){
 const key=JSON.stringify([getReadCacheAccount(),action,params]);
 const [record,setRecord]=useState<{key:string;value:T|undefined}>(()=>({key,value:initial??peekRead<T>(action,params)}));
 const [failedKey,setFailedKey]=useState('');
 const available=record.key===key?record.value:peekRead<T>(action,params);
 const setData=useCallback((next:SetStateAction<T>)=>{
  setRecord(previous=>{
   const before=previous.key===key?previous.value:initial??peekRead<T>(action,params);
   return {key,value:typeof next==='function'?(next as (value:T)=>T)(before??empty):next};
  });
  setFailedKey('');
 },[key]);
 const fail=useCallback((error?:unknown)=>{if(isAuthorizationError(error))setRecord({key,value:empty});setFailedKey(key);},[key]);
 return {data:available??empty,loading:available===undefined&&failedKey!==key,setData,fail,key};
}
