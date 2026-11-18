/** Database roles are authoritative. `visitor` is the existing storage value for user. */
export const isTesterRole=(role:string)=>role==='tester';
export const isBusinessManager=(role:string)=>role==='admin'||role==='secondary_admin';
export const canDeleteContent=(role:string)=>['admin','tester','visitor'].includes(role);
export const canVisitManagement=(role:string,page:string)=>role==='admin'||role==='tester'||role==='secondary_admin'&&['review','grading','users','invites','logs','config'].includes(page);
export const roleDisplayLabel=(role:string)=>role==='admin'?'主管理员':role==='secondary_admin'?'副管理员':role==='tester'?'测试员':'普通用户';
export const roleLabel=(role:string)=>role==='admin'?'primary admin':role==='secondary_admin'?'secondary admin':role==='tester'?'tester':'user';
export const testerPreviewPages=new Set(['review','users','invites','grading','trash','logs','config']);
const testerActions=new Set(['ackLoginIdNotice','mistakeExams','mistakes','me','sessionStatus','sessionActivity','presence','changePassword','settings','updateAvatar','exams','testerExam','files','testerFile','getExam','createExam','saveExam','submitReview','deleteExam','copyExam','startAttempt','startRedoAttempt','pauseAttempt','resumeAttempt','attempt','saveAttempt','submitAttempt','history','historyQuery','leaderboard','upload','renewUpload','verifyUpload','deleteFile','conversionInfo','conversionInputs','wakeConverter','conversions','createConversion','deleteConversion','cancelConversion','conversionDownload']);
export function roleAllows(role:string,action:string,params:Record<string,unknown>={}){
 if(!['admin','visitor','tester','secondary_admin'].includes(role))return false;
 if(role==='secondary_admin'){
  if(!testerActions.has(action)&&!['grade','updateFile','review','fileUrl','users','userPresence','invites','createInvite','revokeInvite','logs','config'].includes(action))return false;
  if(['deleteExam','deleteFile','deleteConversion','cancelConversion','testerExam','testerFile'].includes(action))return false;
  if(action==='exams'&&params.mode==='trash')return false;
  if(action==='review'&&!['publish','return'].includes(String(params.decision)))return false;
  return true;
 }
 if(!isTesterRole(role))return true;
 if(!testerActions.has(action))return false;
 if(action==='exams'&&['admin','trash'].includes(String(params.mode)))return false;
 if(['history','historyQuery'].includes(action)&&params.all===true)return false;
 if(action==='upload'&&params.purpose==='shared')return false;
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

/** Reject nested resource removal as well as explicit delete endpoints. */
export function nonDestructiveExamChange(before:any,after:any):string|undefined{
 if(before.status==='published')return '副管理员不能修改已发布试卷；请复制为新草稿。';
 for(const old of before.questions??[]){
  const next=(after.questions??[]).find((q:any)=>q.id===old.id);
  if(!next||next.kind!==old.kind||(next.options??[]).length<(old.options??[]).length||(old.attachments??[]).some((id:string)=>!(next.attachments??[]).includes(id)))return '副管理员可以新增和编辑，不能移除已有题目、选项或附件，也不能更换已有题型。';
 }
 return undefined;
}
