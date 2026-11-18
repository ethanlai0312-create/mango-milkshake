import type {Question} from './model.ts';

export const geometryReviewLabels={correct:'正确',wrong:'错误',partial:'部分正确',review:'需要进一步审核'} as const;
export type GeometryReviewStatus=keyof typeof geometryReviewLabels;
export type QuestionGrade={score:number|null;status:'final'|'pending';manualStatus?:GeometryReviewStatus;referenceReleased?:boolean};
export type ManualReviewInput={scores?:unknown;comments?:unknown;manualStatus?:unknown;referenceReleases?:unknown};
const manualKinds=['short','drawing','file','formula','proof'];
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

/** All decisions are applied to the attempt's immutable version; no diagram is graded by step equality. */
export function buildManualReview(questions:Question[],existing:Record<string,QuestionGrade>|null,input:ManualReviewInput,existingComments:Record<string,string>={}){
 const grades={...existing},comments={...existingComments},errors:string[]=[];
 const manual=questions.filter(q=>manualKinds.includes(q.kind)),manualIds=new Set(manual.map(q=>q.id)),drawingIds=new Set(manual.filter(q=>q.kind==='drawing').map(q=>q.id));
 for(const [field,allowed] of [['scores',manualIds],['comments',manualIds],['manualStatus',drawingIds],['referenceReleases',drawingIds]] as const){
  const values=input[field];if(values===undefined)continue;
  if(!record(values)||Object.keys(values).some(id=>!allowed.has(id)))errors.push('批改参数 '+field+' 包含无效题目');
 }
 if(errors.length)return {grades,comments,score:0,errors};
 const scores=(input.scores??{}) as Record<string,unknown>,notes=(input.comments??{}) as Record<string,unknown>,statuses=(input.manualStatus??{}) as Record<string,unknown>,releases=(input.referenceReleases??{}) as Record<string,unknown>;
 for(const q of manual){
  const previous=grades[q.id],rawScore=Object.hasOwn(scores,q.id)?scores[q.id]:previous?.score;
  const numeric=typeof rawScore==='number'||typeof rawScore==='string'&&rawScore.trim()!==''?Number(rawScore):NaN;
  const selected=q.kind==='drawing'?(Object.hasOwn(statuses,q.id)?statuses[q.id]:previous?.manualStatus??(Number.isFinite(numeric)?numeric===q.points?'correct':numeric===0?'wrong':'partial':'review')):undefined;
  if(q.kind==='drawing'&&(typeof selected!=='string'||!Object.hasOwn(geometryReviewLabels,selected))){errors.push('几何题审核状态无效');continue;}
  const pending=selected==='review';
  if(!pending&&(!Number.isFinite(numeric)||numeric<0||numeric>q.points)){errors.push('请填写每道人工作答的有效分数');continue;}
  if(!pending&&(selected==='correct'&&numeric!==q.points||selected==='wrong'&&numeric!==0)){errors.push('几何题正确应为满分，错误应为零分');continue;}
  if(Object.hasOwn(releases,q.id)&&typeof releases[q.id]!=='boolean'){errors.push('参考答案公开权限必须为布尔值');continue;}
  const referenceReleased=q.kind==='drawing'?(releases[q.id]??previous?.referenceReleased??false)===true:false;
  if(referenceReleased&&(q.answer===undefined||q.answer===null||q.answer==='')){errors.push('本题没有可公开的参考作图');continue;}
  const comment=Object.hasOwn(notes,q.id)?notes[q.id]:comments[q.id];
  if(comment!==undefined&&(typeof comment!=='string'||comment.length>20000)){errors.push('批改评语格式无效或过长');continue;}
  if(typeof comment==='string')comments[q.id]=comment;
  grades[q.id]={score:pending?null:numeric,status:pending?'pending':'final',...q.kind==='drawing'?{manualStatus:selected as GeometryReviewStatus,referenceReleased}:{}};
 }
 const score=Math.round(Object.values(grades).reduce((sum,grade)=>sum+(grade.score??0),0)*100)/100;
 return {grades,comments,score,errors};
}

export function releasedDrawingReferences(questions:Question[],grades:Record<string,QuestionGrade>|null|undefined){
 return Object.fromEntries(questions.filter(q=>q.kind==='drawing'&&grades?.[q.id]?.referenceReleased===true).map(q=>[q.id,true]));
}
