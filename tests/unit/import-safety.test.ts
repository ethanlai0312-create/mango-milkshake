import {describe,it,expect,vi} from 'vitest';
import {newQuestion} from '../../shared/model';
import {exportCSV,importQuestionFile,importQuestions,MAX_IMPORT_QUESTIONS,MAX_QUESTION_IMPORT_BYTES,parseCSV} from '../../shared/import-export';

const question=()=>({...newQuestion('single'),prompt:'正常題幹',answer:0});
const csv=(rows:string[][])=>rows.map(row=>row.map(value=>'"'+value.replaceAll('"','""')+'"').join(',')).join('\r\n');

describe('bounded question imports',()=>{
 it('checks file size/type before reading and accepts only a nonempty import',async()=>{
  const text=vi.fn(async()=>JSON.stringify([question()]));
  await expect(importQuestionFile({name:'a.csv',size:MAX_QUESTION_IMPORT_BYTES+1,text})).rejects.toThrow('5 MiB');
  await expect(importQuestionFile({name:'a.exe',size:1,text})).rejects.toThrow('JSON或CSV');
  await expect(importQuestionFile({name:'a.json',size:0,text})).rejects.toThrow('不能为空');
  expect(text).not.toHaveBeenCalled();
 });
 it('accepts BOM/uppercase extensions and checks the combined count',async()=>{
  const source='\uFEFF'+JSON.stringify({questions:[question()]});
  const file={name:'題目.JSON',size:new TextEncoder().encode(source).length,text:async()=>source};
  expect(await importQuestionFile(file,MAX_IMPORT_QUESTIONS-1)).toHaveLength(1);
  await expect(importQuestionFile(file,MAX_IMPORT_QUESTIONS)).rejects.toThrow('总题数');
 });
 it('caps source bytes and record count before constructing every question',()=>{
  expect(()=>importQuestions(' '.repeat(MAX_QUESTION_IMPORT_BYTES+1),'json')).toThrow('5 MiB');
  expect(()=>parseCSV('欄'.repeat(Math.ceil(MAX_QUESTION_IMPORT_BYTES/3)+1))).toThrow('5 MiB');
  expect(()=>parseCSV('kind,prompt,answer\n'+'single,題幹,0\n'.repeat(MAX_IMPORT_QUESTIONS+1))).toThrow('2000');
  expect(()=>importQuestions(JSON.stringify(Array.from({length:MAX_IMPORT_QUESTIONS+1},()=>({}))),'json')).toThrow('2000');
 });
 it('rejects malformed closing quotes, duplicate headers and extra structural columns',()=>{
  expect(()=>parseCSV('"A"B,C')).toThrow('关闭引号');
  expect(()=>importQuestions('kind,prompt,answer, answer\nsingle,題幹,0,1','csv')).toThrow('不能重复');
  expect(()=>importQuestions('kind,prompt,answer,__proto__\nsingle,題幹,0,x','csv')).toThrow('不支持');
  expect(()=>parseCSV(Array(33).fill('x').join(','))).toThrow('32');
  expect(()=>parseCSV('x'.repeat(1_500_001))).toThrow('单个字段');
 });
 it('validates options/drawing even when a literal answer is accepted',()=>{
  const invalid=csv([['kind','prompt','answer','options'],['short','題幹','參考答案','[bad']]);
  expect(()=>importQuestions(invalid,'csv')).toThrow('options必须为JSON格式');
  const invalidDrawing=csv([['kind','prompt','answer','drawing'],['short','題幹','"參考答案"','[bad']]);
  expect(()=>importQuestions(invalidDrawing,'csv')).toThrow('drawing必须为JSON格式');
  const valid=csv([['kind','prompt','answer','options'],['short','題幹','參考答案','[]']]);
  expect(importQuestions(valid,'csv')[0].answer).toBe('參考答案');
 });
 it('rejects reserved nested keys and unknown question properties without polluting prototypes',()=>{
  const nested='[{"kind":"short","prompt":"題幹","answer":{"__proto__":{"isAdmin":true}}}]';
  expect(()=>importQuestions(nested,'json')).toThrow('不允许的对象字段');
  expect(({} as Record<string,unknown>).isAdmin).toBeUndefined();
  expect(()=>importQuestions(JSON.stringify([{...question(),role:'admin'}]),'json')).toThrow('不支持的题目字段');
  expect(()=>importQuestions('[null]','json')).toThrow('题目必须是对象');
  expect(()=>importQuestions('null','json')).toThrow('数组');
 });
 it('rejects excessive JSON nesting, escaped NUL and infinite numeric values',()=>{
  expect(()=>importQuestions('['.repeat(70)+'0'+']'.repeat(70),'json')).toThrow('64层');
  expect(()=>importQuestions('[{"kind":"short","prompt":"题干","answer":"\\u0000"}]','json')).toThrow('无效字符');
  expect(()=>importQuestions('[{"kind":"short","prompt":"题干","answer":1e999}]','json')).toThrow('无效数值');
 });
 it('treats formulas/commands as data and removes executable markup on import',()=>{
  const source=csv([['kind','prompt','answer','explanation'],['short','<p onclick="alert(1)">=SUM(A1:A2)</p><script>alert(1)</script>','SELECT * FROM lessons;','<p onclick="run()">重點</p><script>run()</script>']]);
  const imported=importQuestions(source,'csv')[0];
  expect(imported.prompt).toBe('<p>=SUM(A1:A2)</p>');
  expect(imported.answer).toBe('SELECT * FROM lessons;');
  expect(imported.explanation).toBe('<p>重點</p>');
 });
 it('rejects answers with object types that cannot be saved by the API',()=>{
  expect(()=>importQuestions(JSON.stringify([{...question(),kind:'short',answer:{a:'文字'}}]),'json')).toThrow('参考答案必须为');
  expect(()=>importQuestions(JSON.stringify([{...question(),kind:'numeric',answer:[1]}]),'json')).toThrow('数值答案必须为');
 });
 it('keeps field boundaries and protects formula-like prefixes in exported CSV',()=>{
  const prefixes=['=1+2','+1+2','-1+2','@SUM(A1:A2)','＝1+2','＋1+2','－1+2','＠SUM(A1:A2)','\u200b=1+2','\ttext','\rtext','\ntext'];
  const rows=parseCSV(exportCSV(prefixes.map(prompt=>({...question(),prompt}))).slice(1));
  expect(rows).toHaveLength(prefixes.length+1);
  expect(rows.slice(1).every(row=>row.length===6)).toBe(true);
  expect(rows.slice(1).map(row=>row[1])).toEqual(prefixes.map(prefix=>"'"+prefix));
  const escaped=parseCSV(exportCSV([{...question(),prompt:'正常,"=1+2\r\n題幹'}]).slice(1));
  expect(escaped[1][1]).toBe('正常,"=1+2\r\n題幹');
  expect(escaped[1]).toHaveLength(6);
 });
});
