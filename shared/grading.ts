import * as OpenCC from 'opencc-js';
import type {Question} from './model.ts';
// Build conversion dictionaries only when grading text; file APIs do not need them.
let simpleConverter:ReturnType<typeof OpenCC.Converter>|undefined,traditionalConverter:ReturnType<typeof OpenCC.Converter>|undefined;
const toSimple=(text:string)=>(simpleConverter??=OpenCC.Converter({from:'tw',to:'cn'}))(text);
const toTraditional=(text:string)=>(traditionalConverter??=OpenCC.Converter({from:'cn',to:'tw'}))(text);
export function normalizeText(v:unknown,q:Pick<Question,'traditionalOnly'|'ignoreCase'|'ignorePunctuation'>,standard=false){let s=String(v??'').normalize('NFKC').trim();if(q.traditionalOnly){if(standard)s=toTraditional(s);}else s=toSimple(s);if(q.ignoreCase)s=s.toLowerCase();if(q.ignorePunctuation)s=s.replace(/[\p{P}\p{Z}]/gu,'');return s;}
export function textEqual(input:unknown,accepted:unknown[],q:Question){return accepted.some(a=>normalizeText(input,q)===normalizeText(a,q,true));}
export function numberValue(input:unknown){const s=String(input).trim();if(/^[-+]?\d+(?:\.\d+)?\s*\/\s*[-+]?\d+(?:\.\d+)?$/.test(s)){const [a,b]=s.split('/').map(Number);return b? a/b:NaN;}return s!==''?Number(s):NaN;}
export function gradeQuestion(q:Question,a:any):{score:number|null;status:'final'|'pending'}{
 if(['short','drawing','file','formula'].includes(q.kind))return {score:null,status:'pending'};
 let ratio=0;
 if(['single','boolean'].includes(q.kind))ratio=String(a)===String(q.answer)?1:0;
 if(q.kind==='multiple'){const expected=new Set((q.answer as any[]).map(String)),got=new Set((Array.isArray(a)?a:[]).map(String));const good=[...got].filter(v=>expected.has(v)).length,bad=got.size-good;ratio=q.partial?Math.max(0,(good-bad)/Math.max(1,expected.size)):good===expected.size&&bad===0?1:0;}
 if(q.kind==='blank')ratio=textEqual(a,Array.isArray(q.answer)?q.answer:[q.answer],q)?1:0;
 if(['blanks','table'].includes(q.kind)){const keys=q.answer as any[][];const weights=keys.map((_,i)=>q.blankPoints[i]??q.points/keys.length);const total=weights.reduce((s,n)=>s+n,0);ratio=total?keys.reduce((s,v,i)=>s+(textEqual(a?.[i],v,q)?weights[i]:0),0)/total:0;}
 if(['matching','connection','ordering'].includes(q.kind)){const keys=q.answer as any[];const count=keys.filter((v,i)=>String(a?.[i])===String(v)).length;ratio=q.partial?count/keys.length:count===keys.length?1:0;}
 if(q.kind==='numeric'){const n=numberValue(a),expected=numberValue(q.answer);ratio=Number.isFinite(n)&&Number.isFinite(expected)&&Math.abs(n-expected)<=Math.max(0,q.tolerance)?1:0;}
 if(q.kind==='hotspot'){const zone=q.answer;ratio=a&&zone&&Math.hypot(a.x-zone.x,a.y-zone.y)<=zone.radius?1:0;}
 return {score:Math.round(q.points*Math.min(1,Math.max(0,ratio))*100)/100,status:'final'};
}
export function gradeExam(questions:Question[],answers:Record<string,any>){const grades=Object.fromEntries(questions.map(q=>[q.id,gradeQuestion(q,answers[q.id])]));return {grades,score:Math.round(Object.values(grades).reduce((s,g)=>s+(g.score??0),0)*100)/100,max_score:Math.round(questions.reduce((s,q)=>s+q.points,0)*100)/100,grading_status:Object.values(grades).some(g=>g.status==='pending')?'pending':'final'};}
