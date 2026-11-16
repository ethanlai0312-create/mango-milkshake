import type {Question} from './model.ts';
import {validateDrawing} from './geometry/index.ts';
import {drawingOptions} from './drawing-question.ts';
import type {ConstructionContext} from './geometry/types.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateAnswers(questions:Question[],answers:unknown,context?:ConstructionContext){
 if(!answers||typeof answers!=='object'||Array.isArray(answers))return ['答案必须为对象'];
 const errors:string[]=[],map=answers as Record<string,any>,ids=new Set(questions.map(q=>q.id));
 if(Object.keys(map).some(id=>!ids.has(id)))errors.push('答案包含不属于本试卷的题目');
 for(const q of questions){const a=map[q.id];if(a===undefined||a===null||a==='')continue;const index=(v:any)=>Number.isInteger(v)&&v>=0&&v<q.options.length;let valid=true;
  if(q.kind==='single')valid=index(a);
  else if(q.kind==='multiple'||q.kind==='ordering')valid=Array.isArray(a)&&a.length<=q.options.length&&a.every(index)&&new Set(a).size===a.length;
  else if(q.kind==='matching'||q.kind==='connection')valid=Array.isArray(a)&&a.length<=q.options.length&&a.every(v=>v===null||v===''||index(v));
  else if(q.kind==='boolean')valid=['true','false'].includes(a);
  else if(['blank','short','formula','numeric'].includes(q.kind))valid=(typeof a==='string'&&a.length<=50000)||(q.kind==='numeric'&&typeof a==='number'&&Number.isFinite(a));
  else if(['blanks','table'].includes(q.kind))valid=Array.isArray(a)&&a.length<=q.options.length&&a.every(v=>v===null||typeof v==='string'&&v.length<=10000);
  else if(q.kind==='file')valid=typeof a==='string'&&uuid.test(a);
  else if(q.kind==='hotspot')valid=typeof a==='object'&&[a.x,a.y].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100);
  else if(q.kind==='drawing'){const drawingErrors=validateDrawing(a,drawingOptions(q,{...context,questionId:q.id}));if(drawingErrors.length){errors.push(`题目 ${questions.indexOf(q)+1} 的答案格式无效：${drawingErrors.join('；')}`);continue;}}
  if(!valid)errors.push(`题目 ${questions.indexOf(q)+1} 的答案格式无效`);
 }
 return errors;
}
