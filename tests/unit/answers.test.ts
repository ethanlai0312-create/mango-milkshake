import {describe,it,expect} from 'vitest';
import {newQuestion} from '../../shared/model';
import {validateAnswers} from '../../shared/answers';
describe('不信任客户端答案结构',()=>{
 it('允许留空答案但拒绝数组作为答卷',()=>{expect(validateAnswers([newQuestion()],{})).toEqual([]);expect(validateAnswers([],[])).toHaveLength(1);});
 it('拒绝伪造题目',()=>expect(validateAnswers([],{fake:'answer'})).toHaveLength(1));
 it('拒绝越界或重复的排序值',()=>{const q=newQuestion('ordering');expect(validateAnswers([q],{[q.id]:[0,0,99]})).toHaveLength(1);});
 it('绘图必须为真实结构化对象数组',()=>{const q=newQuestion('drawing');expect(validateAnswers([q],{[q.id]:{map:'attack'}})).toHaveLength(1);expect(validateAnswers([q],{[q.id]:[{id:crypto.randomUUID(),tool:'segment',points:[{x:1,y:2},{x:30,y:40}],color:'#334455',width:2}]})).toEqual([]);});
 it('禁止SVG属性URL注入和无穷坐标',()=>{const q=newQuestion('drawing');expect(validateAnswers([q],{[q.id]:[{id:crypto.randomUUID(),tool:'segment',points:[{x:Infinity,y:2}],color:'url(https://example.com)',width:2}]})).toHaveLength(1);});
 it('允许尚未配完的映射',()=>{const q=newQuestion('matching');expect(validateAnswers([q],{[q.id]:[1,null,'']})).toEqual([]);});
 it('文件提交只能保存文件ID',()=>{const q=newQuestion('file');expect(validateAnswers([q],{[q.id]:'https://private-file'})).toHaveLength(1);});
});
