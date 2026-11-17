import {describe,it,expect} from 'vitest';
import {newQuestion} from '../../shared/model';
import {validateQuestion,validateStructure} from '../../shared/validation';
import {parseCSV,importQuestions,exportCSV} from '../../shared/import-export';
describe('不信任导入与评分结构',()=>{
 it('拒绝未知题型和无穷分值',()=>{expect(validateQuestion({...newQuestion(),kind:'admin',points:Infinity})).toHaveLength(2);});
 it('草稿可以保留未完成内容，发布不可以',()=>{expect(validateQuestion(newQuestion())).toEqual([]);expect(validateQuestion(newQuestion(),true).length).toBeGreaterThan(0);});
 it('拒绝重复或越界的排序答案',()=>{const q={...newQuestion('ordering'),prompt:'排序',answer:[0,0,1,2]};expect(validateQuestion(q,true).join()).toContain('不重复');});
 it('拒绝空答案误判为空正确',()=>expect(validateQuestion({...newQuestion('blank'),prompt:'填空',answer:['']},true).length).toBeGreaterThan(0));
 it('拒绝多空数量和分值不匹配',()=>expect(validateQuestion({...newQuestion('blanks'),prompt:'题干',blankPoints:[1]},true).length).toBeGreaterThan(0));
 it('兼容CSV引号、逗号、换行和双引号',()=>expect(parseCSV('a,b\r\n"x,y","z\n""q"""')).toEqual([['a','b'],['x,y','z\n"q"']]));
 it('拒绝截断CSV引号',()=>expect(()=>parseCSV('a,"x')).toThrow('未闭合'));
 it('CSV导入导出保留答案和选项',()=>{const q={...newQuestion('single'),prompt:'苹果,"香蕉"\n水果',answer:1};const restored=importQuestions(exportCSV([q]),'csv')[0];expect(restored.prompt).toBe(q.prompt);expect(restored.options).toEqual(q.options);expect(restored.answer).toBe(1);expect(restored.id).not.toBe(q.id);});
 it('JSON导入不接受非法种类',()=>expect(()=>importQuestions('[{"kind":"oops"}]','json')).toThrow('未知题型'));
 it('非法整体对象给出错误而非抛出类型错误',()=>expect(validateStructure({})).toContain('题目必须为不超过2000项的数组'));
});
