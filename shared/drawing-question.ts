import type {Question} from './model.ts';
import type {ConstructionContext,DrawingDocument,DrawingValidationOptions} from './geometry/types.ts';

/** The immutable exam version, never the answer document, decides the permitted tools. */
export function drawingOptions(question:Question,context?:ConstructionContext):DrawingValidationOptions{
 const mode=question.drawing?.mode??'free';
 return {mode,initial:question.drawing?.initial,allowLegacy:mode==='free'&&!question.drawing?.initial,context};
}

/** Binding is server-owned metadata. Imported client role claims are never authorization. */
export function bindDrawingAnswers(questions:Question[],answers:Record<string,any>,attemptId:string,actorId?:string){
 const result={...answers};
 for(const q of questions){const value=answers[q.id];if(q.kind!=='drawing'||!value||value.version!==2)continue;
  const document=value as DrawingDocument;
  result[q.id]={...document,steps:document.steps.map(step=>({...step,context:{questionId:q.id,attemptId,role:'participant' as const,...actorId?{actorId}:{}}}))};
 }
 return result;
}

export function bindDrawingQuestions(questions:Question[],actorId:string){
 return questions.map(q=>{
  if(q.kind!=='drawing')return q;
  const bind=(value:any)=>value?.version===2?{...value,steps:value.steps.map((step:DrawingDocument['steps'][number])=>({...step,context:{questionId:q.id,role:'author',actorId}}))}:value;
  return {...q,answer:bind(q.answer),...q.drawing?{drawing:{mode:q.drawing.mode,...q.drawing.initial?{initial:bind(q.drawing.initial)}:{}}}:{}};
 });
}
