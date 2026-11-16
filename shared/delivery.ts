import type {Exam} from './model.ts';
import {lockInitialDrawing} from './geometry/index.ts';
export type DeliveryMap={legacy?:boolean;pairs?:Record<string,number[]>};
export function createDeliveryMap(exam:Exam):DeliveryMap{
 const pairs:Record<string,number[]>={};
 for(const q of exam.questions)if(['matching','connection'].includes(q.kind)){
  const order=q.options.map((_,i)=>i);for(let i=order.length-1;i>0;i--){const random=new Uint32Array(1);crypto.getRandomValues(random);const j=random[0]%(i+1);[order[i],order[j]]=[order[j],order[i]];}pairs[q.id]=order;
 }
 return{pairs};
}
export function deliveredExam(exam:Exam,map:DeliveryMap,reveal:boolean,drawingDisclosure:{admin?:boolean;released?:Record<string,boolean>}={}):Exam{
 return {...exam,questions:exam.questions.map(q=>{
  const order=map.pairs?.[q.id];
  const question={...q};
  if(q.kind==='drawing'&&q.drawing){
   question.drawing={mode:q.drawing.mode,...q.drawing.initial?{initial:lockInitialDrawing(q.drawing.initial)}:{}};
  }
  if(order){
   question.options=q.options.map((option,i)=>option.split('↔')[0]+'↔'+(q.options[order[i]].split('↔')[1]??q.options[order[i]]));
   if(Array.isArray(q.answer))question.answer=q.answer.map((right:number)=>order.indexOf(right));
  }
  const permitted=q.kind==='drawing'
   ?drawingDisclosure.admin===true||drawingDisclosure.released?.[q.id]===true
   :reveal;
  if(!permitted){
   const {answer,explanation,...publicQuestion}=question;
   return publicQuestion as any;
  }
  if(exam.show_explanations===false&&!drawingDisclosure.admin){
   const {explanation,...visibleQuestion}=question;
   return visibleQuestion as any;
  }
  return question;
 })};
}
export function canonicalAnswers(answers:Record<string,any>,map:DeliveryMap){
 const result={...answers};for(const [id,order]of Object.entries(map.pairs??{}))if(Array.isArray(answers[id]))result[id]=answers[id].map((right:any)=>Number.isInteger(right)?order[right]:right);return result;
}
export function publicAttempt(attempt:any){const {delivery_map,...result}=attempt;return result;}
