import {useEffect,useSyncExternalStore} from 'react';
import {pageModules} from '../lib/page-preload';
import {DocumentFrame} from './DocumentFrame';

export function DocumentPage({kind,...props}:{kind:'editor'|'attempt';id:string;user:any;authSession?:string;onClose:()=>void}){
 const resource=pageModules[kind],snapshot=useSyncExternalStore(resource.subscribe,resource.getSnapshot);
 useEffect(()=>{void resource.load().catch(()=>{});},[resource]);
 if(snapshot.value){const Page=snapshot.value;return <Page {...props}/>;}
 return <DocumentFrame kind={kind} onClose={props.onClose} error={snapshot.error?'页面资源暂不可用，请检查网络后重试。':undefined} onRetry={()=>void resource.load().catch(()=>{})}/>;
}
