import {api} from './api';
import {peekRead,captureReadCacheScope,getReadCacheAccount} from './read-cache';
import {preloadedModule} from '../../shared/preloaded-module';

export const pageModules={
 editor:preloadedModule(()=>import('../pages/Editor').then(m=>m.Editor)),
 attempt:preloadedModule(()=>import('../pages/Attempt').then(m=>m.Attempt)),
};
const readLoads=new Map<string,Promise<unknown>>();
const codeFor=(page:string)=>page==='create'?'editor':page;
function readFor(page:string):[string,Record<string,unknown>][] {
 if(['exams','rank','mine'].includes(page))return [['exams',{mode:page==='mine'?'mine':'public',search:'',offset:0}]];
 if(page==='history'||page==='grading')return [['historyQuery',{all:page==='grading',version:null,sort:'date',offset:0}]];
 if(page==='shared')return [['files',{search:'',offset:0,category:'',sort:'created_at',ascending:false}]];
 if(page==='convert')return [['conversions',{offset:0}],['conversionInputs',{}],['conversionInfo',{}]];
 if(page==='review'||page==='trash')return [['exams',{mode:page==='trash'?'trash':'admin',search:'',offset:0}]];
 if(page==='invites'||page==='logs')return [[page,{mode:'admin',search:'',offset:0}]];
 return [];
}
/** Intent/idle warming only; normal page requests remain authoritative. */
export function prefetchPage(page:string){
 const resource=pageModules[codeFor(page) as keyof typeof pageModules];
 if(resource)void resource.load().catch(()=>{});
 for(const [action,params] of readFor(page)){
  const readKey=JSON.stringify([captureReadCacheScope(getReadCacheAccount()),action,params]);
  if(peekRead(action,params)!==undefined||readLoads.has(readKey))continue;
  const promise=api(action,params).catch(()=>{}).finally(()=>readLoads.delete(readKey));readLoads.set(readKey,promise);
 }
}
/** Warm code sequentially after first paint to avoid a burst of parse work. */
export function warmPageModules(){
 let cancelled=false;const frame=requestAnimationFrame(async()=>{
  prefetchPage('exams');prefetchPage('mine');prefetchPage('history');
  for(const resource of [pageModules.editor,pageModules.attempt]){if(cancelled)return;try{await resource.load();}catch{/* Retry on a later intent. */}}
 });
 return()=>{cancelled=true;cancelAnimationFrame(frame);};
}
