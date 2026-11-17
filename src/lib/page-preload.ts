import {api} from './api';
import {peekRead,captureReadCacheScope,getReadCacheAccount,getReadCacheRole} from './read-cache';
import {isTesterRole,testerPreviewPages} from '../../shared/roles';
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
 if(['invites','logs'].includes(page))return [[page,{mode:'admin',search:'',offset:0}]];
 return [];
}
/** Intent/idle warming only; normal page requests remain authoritative. */
export async function preparePage(page:string){
 if(testerPreviewPages.has(page)&&getReadCacheRole()!=='admin')return;
 const resource=pageModules[codeFor(page) as keyof typeof pageModules];
 if(resource)await resource.load();
 const jobs:Promise<unknown>[]=[];
 for(const [action,params] of readFor(page)){
  const readKey=JSON.stringify([captureReadCacheScope(getReadCacheAccount()),action,params]);
  if(peekRead(action,params)!==undefined)continue;if(readLoads.has(readKey)){jobs.push(readLoads.get(readKey)!);continue;}
  const promise=api(action,params).finally(()=>readLoads.delete(readKey));readLoads.set(readKey,promise);jobs.push(promise);
 }
 await Promise.all(jobs);
}
export function prefetchPage(page:string){void preparePage(page).catch(()=>{});}
/** Warm code sequentially after first paint to avoid a burst of parse work. */
export function warmPageModules(){
 let cancelled=false;const frame=requestAnimationFrame(async()=>{
  void (async()=>{for(const resource of [pageModules.editor,pageModules.attempt]){if(cancelled)return;try{await resource.load();}catch{/* Retry on a later intent. */}}})();
  const pages=['exams','mine','history','shared','convert',...(getReadCacheRole()==='admin'?['review','users','invites','grading','trash','logs','config']:[])];
  for(const page of pages){if(cancelled)return;try{await preparePage(page);}catch{/* Retry on explicit selection. */}}

 });
 return()=>{cancelled=true;cancelAnimationFrame(frame);};
}

/** Sensitive reads are handed to this one navigation only, never stored in the display cache. */
export async function prepareNavigation(page:string):Promise<any>{
 await preparePage(page);
 if(getReadCacheRole()==='admin'&&['users','config'].includes(page))return {rows:await api(page,{mode:'admin',search:'',offset:0})};
 if(page==='mistakes'){
  const exams=await api('mistakeExams');
  const rows=exams[0]?await api('mistakes',{exam:exams[0].exam_id,mode:'wrong',offset:0}):[];
  return {exams,rows};
 }
 return undefined;
}
