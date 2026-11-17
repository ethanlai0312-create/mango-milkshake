import type {Question} from './model.ts';
export type ReviewState='wrong'|'partial'|'correct'|'pending';
export function questionResult(question:Pick<Question,'points'>,grade:any):ReviewState{
 if(grade?.status==='pending'||typeof grade?.score!=='number'||!Number.isFinite(grade.score))return 'pending';
 if(grade.score===0)return 'wrong';
 return grade.score<question.points?'partial':'correct';
}
export function answerComplete(q:Pick<Question,'kind'|'options'>,answer:any):boolean{
 if(answer===undefined||answer===null)return false;
 const filled=(v:any)=>typeof v==='string'?v.trim().length>0:typeof v==='number'&&Number.isFinite(v);
 if(q.kind==='single')return Number.isInteger(answer)&&answer>=0&&answer<q.options.length;
 if(q.kind==='boolean')return answer==='true'||answer==='false';
 if(q.kind==='multiple')return Array.isArray(answer)&&answer.length>0;
 if(['matching','connection','ordering','blanks','table'].includes(q.kind)){
  const length=q.options.length||(q.kind==='blanks'?2:0);return length>0&&Array.isArray(answer)&&answer.length===length&&Array.from({length},(_,i)=>answer[i]).every(filled);
 }
 if(q.kind==='drawing')return Array.isArray(answer)?answer.length>0:Array.isArray(answer?.objects)&&answer.objects.some((o:any)=>!o.locked&&o.layer!=='initial');
 if(q.kind==='hotspot')return typeof answer==='object'&&Number.isFinite(answer.x)&&Number.isFinite(answer.y);
 return filled(answer);
}
export function firstIncomplete(questions:Pick<Question,'id'|'kind'|'options'>[],answers:Record<string,unknown>){return questions.findIndex(q=>!answerComplete(q,answers[q.id]));}
