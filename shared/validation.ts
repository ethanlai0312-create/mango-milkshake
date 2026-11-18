import {kinds,type Exam,type Question} from './model.ts';
import {validateDrawing,validateInitialDrawing} from './geometry/index.ts';
import {drawingOptions} from './drawing-question.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
const index=(v:unknown,count:number)=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<count;
export function validateQuestion(value:unknown,publish=false):string[]{
 const q=value as Question,errors:string[]=[];
 if(!q||typeof q!=='object'||Array.isArray(q))return ['题目必须是对象'];
 if(!uuid.test(q.id??''))errors.push('题目ID无效');
 if(!Object.hasOwn(kinds,q.kind))errors.push('未知题型');
 if(!text(q.prompt,100000))errors.push('题干格式无效或过长');
 else if(publish&&!q.prompt.replace(/<[^>]*>/g,'').trim())errors.push('缺少题干');
 if(!finite(q.points,.01,10000))errors.push('分数必须为0.01到10000之间的有限数值');
 if(!Array.isArray(q.options)||q.options.length>100||q.options.some(v=>!text(v,10000)))errors.push('选项必须为不超过100项的文本数组');
 if(!text(q.explanation,100000))errors.push('解析格式无效或过长');
 if(!Array.isArray(q.attachments)||q.attachments.length>20||q.attachments.some(v=>!uuid.test(v)))errors.push('附件ID无效或过多');
 for(const field of ['traditionalOnly','ignoreCase','ignorePunctuation','partial','shuffle'] as const)if(typeof q[field]!=='boolean')errors.push(field+'必须为布尔值');
 if(!finite(q.tolerance,0,1e12))errors.push('误差范围无效');
 if(!Array.isArray(q.blankPoints)||q.blankPoints.some(v=>!finite(v,0,10000)))errors.push('每空分值无效');
 if(q.kind==='drawing'){
  if(q.drawing!==undefined){
   if(!q.drawing||typeof q.drawing!=='object'||Array.isArray(q.drawing)||!['free','strict'].includes(q.drawing.mode)||Object.keys(q.drawing).some(key=>!['mode','initial'].includes(key)))errors.push('几何题必须选择自由绘图或严格尺规模式');
   else if(q.drawing.initial!==undefined)errors.push(...validateInitialDrawing(q.drawing.initial).map(error=>'初始图形：'+error));
  }
  if(q.answer!==undefined&&q.answer!==null&&q.answer!=='')errors.push(...validateDrawing(q.answer,drawingOptions(q)).map(error=>'参考作图：'+error));
 }
 if(errors.length||!publish)return errors;
 for(const option of q.options)for(const reference of option.matchAll(/(?:图片|视频)\[([0-9a-f-]{36})\]/g))if(!q.attachments.includes(reference[1]))errors.push('选项媒体必须引用本题附件');
 const count=q.options.length;
 if(['single','multiple','ordering','matching','connection'].includes(q.kind)&&count<2)errors.push('至少需要两个选项');
 switch(q.kind){
 case 'single':if(!index(q.answer,count))errors.push('请选择有效的正确选项');break;
 case 'multiple':if(!Array.isArray(q.answer)||!q.answer.length||q.answer.some(v=>!index(v,count))||new Set(q.answer).size!==q.answer.length)errors.push('多选答案必须是非空且不重复的选项集合');break;
 case 'boolean':if(!['true','false'].includes(q.answer))errors.push('判断答案必须为正确或错误');break;
 case 'blank':if(!Array.isArray(q.answer)||!q.answer.length||q.answer.some(v=>!text(v,10000)||!v.trim()))errors.push('每个可接受答案不能为空');break;
 case 'blanks':case 'table':if(!count||!Array.isArray(q.answer)||q.answer.length!==count||q.answer.some(v=>!Array.isArray(v)||!v.length||v.some(a=>!text(a,10000)||!a.trim())))errors.push('每个空必须设置非空可接受答案');if(q.blankPoints.length&&q.blankPoints.length!==count)errors.push('各空分值数量必须与空格数一致');if(q.blankPoints.length&&Math.abs(q.blankPoints.reduce((s,n)=>s+n,0)-q.points)>.001)errors.push('各空分值之和必须等于本题分值');break;
 case 'ordering':case 'matching':case 'connection':if(!Array.isArray(q.answer)||q.answer.length!==count||q.answer.some(v=>!index(v,count))||new Set(q.answer).size!==count)errors.push('顺序或配对答案必须完整且不重复');break;
 case 'numeric':{const s=String(q.answer??'').trim(),parts=s.split('/');const n=parts.length===2?Number(parts[0])/Number(parts[1]):Number(s);if(!s||parts.length>2||!Number.isFinite(n))errors.push('数值答案无效');break;}
 case 'hotspot':if(!q.answer||!finite(q.answer.x,0,100)||!finite(q.answer.y,0,100)||!finite(q.answer.radius,.1,100))errors.push('请设置有效热点中心和半径');if(!q.options[0]||!/^https:\/\//i.test(q.options[0])&&!q.attachments.some(id=>q.options[0]==='图片['+id+']'))errors.push('热点题需要HTTPS图片网址或已上传的图片附件');break;
 case 'proof':if(typeof q.answer!=='string'||q.answer.length>50000)errors.push('参考证明必须是文本且不超过50000字');break;
 }
 return errors;
}
export function validateStructure(value:unknown,publish=false):string[]{
 const e=value as Exam;if(!e||typeof e!=='object')return ['试卷必须为对象'];const errors:string[]=[];
 if(!text(e.title,200)||!e.title.trim())errors.push('请输入200字以内的试卷名称');
 if(!text(e.description,10000)||!text(e.subject,100))errors.push('试卷简介或学科无效');
 if(!Array.isArray(e.tags)||e.tags.length>30||e.tags.some(v=>!text(v,100)))errors.push('标签格式无效');
 if(!Number.isInteger(e.time_limit)||!finite(e.time_limit,0,604800))errors.push('时间限制必须为0到604800秒的整数');
 for(const field of ['repeat_allowed','reveal_answers','show_explanations'] as const)if(typeof e[field]!=='boolean')errors.push(field+'必须为布尔值');
 if(!Array.isArray(e.questions)||e.questions.length>2000)return [...errors,'题目必须为不超过2000项的数组'];
 if(publish&&!e.questions.length)errors.push('至少添加一道题目');
 const ids=new Set<string>();for(const [i,q]of e.questions.entries()){if(ids.has(q?.id))errors.push(`第${i+1}题ID重复`);ids.add(q?.id);errors.push(...validateQuestion(q,publish).map(s=>`第${i+1}题：${s}`));}
 return errors;
}
