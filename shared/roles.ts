/** Database roles are authoritative. `visitor` is the existing storage value for user. */
export const roleLabel=(role:string)=>role==='admin'?'admin':role==='tester'?'tester':'user';
const testerActions=new Set(['me','sessionStatus','sessionActivity','presence','changePassword','exams','testerExam','files','testerFile']);
export function roleAllows(role:string,action:string,params:Record<string,unknown>={}){
 if(!['admin','visitor','tester'].includes(role))return false;
 if(role!=='tester')return true;
 if(!testerActions.has(action))return false;
 if(action==='exams'&&params.mode!==undefined&&params.mode!=='public')return false;
 if(action==='files'&&params.purpose!==undefined&&params.purpose!=='shared')return false;
 return true;
}
const fields=(value:any,keys:string[])=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,structuredClone(value[key])]));
export function testerExamSummary(value:any){return fields(value,['id','title','description','subject','tags','status','time_limit','published_version_id']);}
export function testerSharedFile(value:any){return fields(value,['id','name','mime','size','description','category','created_at']);}
export function testerExamView(value:any){
 return {...testerExamSummary(value),questions:(value.questions??[]).map((q:any)=>{
  const result=fields(q,['id','kind','prompt','points','options','attachments']);
  // Initial geometry is published content; author/session audit binding is private.
  if(q.drawing){result.drawing=fields(q.drawing,['mode']);if(q.drawing.initial)result.drawing.initial={...fields(q.drawing.initial,['version','mode','objects','toolState','legacy']),steps:[]};}
  return result;
 })};
}
