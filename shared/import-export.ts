import {newQuestion,type Kind,type Question} from './model.ts';
import {validateQuestion} from './validation.ts';
import {sanitizeQuestionRichText} from './rich-text.ts';
export const MAX_QUESTION_IMPORT_BYTES=5*1024*1024;
export const MAX_IMPORT_QUESTIONS=2000;
const maxQuestions=MAX_IMPORT_QUESTIONS,maxColumns=32,maxCellLength=1_500_000;
const reservedKeys=new Set(['__proto__','prototype','constructor']);
const csvFields=new Set(['kind','prompt','answer','options','points','drawing','explanation']);
const questionFields=new Set(['id','kind','prompt','points','options','answer','explanation',
 'traditionalOnly','ignoreCase','ignorePunctuation','partial','shuffle','attachments','tolerance','blankPoints','drawing']);
const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);

function validateSource(source:string){
 // Check the cheap UTF-16 bound before allocating the UTF-8 buffer.
 if(source.length>MAX_QUESTION_IMPORT_BYTES||new TextEncoder().encode(source).byteLength>MAX_QUESTION_IMPORT_BYTES)
  throw new Error('导入文件不能超过5 MiB');
 if(source.includes('\0'))throw new Error('导入文件包含无效字符');
}

function parseJSONValue(source:string):unknown{
 const value:unknown=JSON.parse(source);
 // Iterative traversal also handles hostile nesting without a recursive stack overflow.
 const pending:{value:unknown;depth:number}[]=[{value,depth:0}];
 while(pending.length){
  const item=pending.pop()!;
  if(item.depth>64)throw new Error('JSON嵌套层级不能超过64层');
  if(typeof item.value==='string'&&item.value.includes('\0'))throw new Error('导入文件包含无效字符');
  if(typeof item.value==='number'&&!Number.isFinite(item.value))throw new Error('导入文件包含无效数值');
  if(item.value===null||typeof item.value!=='object')continue;
  for(const [key,child]of Object.entries(item.value)){
   if(reservedKeys.has(key))throw new Error('导入内容包含不允许的对象字段');
   pending.push({value:child,depth:item.depth+1});
  }
 }
 return value;
}

export function parseCSV(text:string):string[][]{
 validateSource(text);
 const rows:string[][]=[];let row:string[]=[],value='',quoted=false,closed=false;
 const cell=()=>{
  if(row.length>=maxColumns)throw new Error('CSV每行不能超过32个字段');
  row.push(value);value='';closed=false;
 };
 const record=()=>{
  cell();
  if(row.some(value=>value!=='')){
   if(rows.length>=maxQuestions+1)throw new Error('导入题目不能超过2000题');
   rows.push(row);
  }
  row=[];
 };
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){
   if(c==='"'){
    if(text[i+1]==='"'){value+='"';i++;}
    else {quoted=false;closed=true;}
   }else value+=c;
  }else if(c===',')cell();
  else if(c==='\n'||c==='\r'){
   if(c==='\r'&&text[i+1]==='\n')i++;
   record();
  }else if(closed)throw new Error('CSV关闭引号后必须是逗号或换行');
  else if(c==='"'){
   if(value.length)throw new Error('CSV引号必须从字段起始处开始');
   quoted=true;
  }else value+=c;
  if(value.length>maxCellLength)throw new Error('CSV单个字段过长');
 }
 if(quoted)throw new Error('CSV存在未闭合的引号');
 if(value||row.length||closed)record();
 return rows;
}

function csvQuestions(source:string):unknown[]{
 const [rawHeader,...values]=parseCSV(source);
 const header=rawHeader?.map(key=>key.trim());
 if(!header?.includes('kind')||!header.includes('prompt')||!header.includes('answer'))
  throw new Error('CSV必须包含kind,prompt,answer字段；建议同时包含options,points');
 if(new Set(header).size!==header.length)throw new Error('CSV表头字段不能重复');
 if(header.some(key=>!csvFields.has(key)))throw new Error('CSV表头包含不支持的字段');
 return values.map((row,i)=>{
  if(row.length!==header.length)throw new Error(`CSV第${i+2}行字段数不一致`);
  const record=Object.fromEntries(header.map((key,j)=>[key,row[j]]));
  const q={...newQuestion(record.kind as Kind),prompt:record.prompt,points:record.points?Number(record.points):5,explanation:record.explanation??''};
  try{q.answer=parseJSONValue(record.answer);}
  catch(error){
   // Literal-answer fallbacks must never swallow structural/depth validation errors.
   if(!(error instanceof SyntaxError))throw error;
   if(q.kind==='blank')q.answer=[record.answer];
   else if(['numeric','short','formula'].includes(q.kind))q.answer=record.answer;
   else throw new Error(`CSV第${i+2}行answer必须为JSON格式`);
  }
  for(const key of ['options','drawing'] as const)if(record[key]){
   try{(q as any)[key]=parseJSONValue(record[key]);}
   catch(error){if(error instanceof SyntaxError)throw new Error(`CSV第${i+2}行${key}必须为JSON格式`);throw error;}
  }
  return q;
 });
}

export function importQuestions(source:string,format:'json'|'csv'):Question[]{
 validateSource(source);
 const normalized=source.replace(/^\uFEFF/,'');
 let rows:unknown;
 if(format==='json'){
  const value=parseJSONValue(normalized);
  rows=Array.isArray(value)?value:isRecord(value)?value.questions:undefined;
 }else rows=csvQuestions(normalized);
 if(!Array.isArray(rows)||rows.length>maxQuestions)throw new Error('导入题目必须为不超过2000项的数组');
 return rows.map((row,i)=>{
  if(!isRecord(row))throw new Error(`第${i+1}题：题目必须是对象`);
  if(Object.keys(row).some(key=>!questionFields.has(key)))throw new Error(`第${i+1}题：包含不支持的题目字段`);
  const raw={...newQuestion(row.kind as Kind),...row,id:crypto.randomUUID()};
  if(['short','formula','file'].includes(raw.kind)&&(typeof raw.answer!=='string'||raw.answer.length>50000))
   throw new Error(`第${i+1}题：参考答案必须为50000字以内的文本`);
  if(raw.kind==='numeric'&&!['string','number'].includes(typeof raw.answer))
   throw new Error(`第${i+1}题：数值答案必须为文本或数值`);
  const shape=validateQuestion(raw);
  if(shape.length)throw new Error(`第${i+1}题：${shape.join('；')}`);
  const q=sanitizeQuestionRichText(raw);
  const errors=validateQuestion(q,true);
  if(errors.length)throw new Error(`第${i+1}题：${errors.join('；')}`);
  return q;
 });
}

/** Check size before File.text() to avoid reading an arbitrarily large local file. */
export async function importQuestionFile(file:Pick<File,'name'|'size'|'text'>,existingQuestionCount=0):Promise<Question[]>{
 if(!/\.(?:json|csv)$/i.test(file.name))throw new Error('请选择JSON或CSV文件');
 if(!Number.isFinite(file.size)||file.size<=0)throw new Error('导入文件不能为空');
 if(file.size>MAX_QUESTION_IMPORT_BYTES)throw new Error('导入文件不能超过5 MiB');
 if(!Number.isInteger(existingQuestionCount)||existingQuestionCount<0||existingQuestionCount>maxQuestions)
  throw new Error('现有题目数量无效');
 const rows=importQuestions(await file.text(),/\.json$/i.test(file.name)?'json':'csv');
 if(rows.length+existingQuestionCount>maxQuestions)throw new Error('试卷总题数不能超过2000题');
 return rows;
}
function spreadsheetCell(value:unknown){
 const text=String(value);
 // CSV quoting preserves cell boundaries; the leading apostrophe marks formulas as text.
 const number=typeof value==='number'||/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text);
 const formula=/^[\s\u200b-\u200f\u2060\ufeff]*[=+\-@＝＋－＠]/.test(text)||/^[\t\r\n]/.test(text);
 const safe=formula&&!number?"'"+text:text;
 return '"'+safe.replaceAll('"','""')+'"';
}
export function exportCSV(questions:Question[]){
 return '\uFEFF'+[['kind','prompt','answer','options','points','drawing'],...questions.map(q=>[
  q.kind,q.prompt,JSON.stringify(q.answer),JSON.stringify(q.options),q.points,JSON.stringify(q.drawing)??'',
 ])].map(row=>row.map(spreadsheetCell).join(',')).join('\r\n');
}
