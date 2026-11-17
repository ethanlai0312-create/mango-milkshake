import {describe,it,expect} from 'vitest';
import {newQuestion,normalizeUsername,duration,splitOptions} from '../../shared/model';
import {gradeQuestion,gradeExam,numberValue} from '../../shared/grading';
describe('服务端评分与基础规则',()=>{
 it('用户名 Unicode 规范化且忽略大小写',()=>expect(normalizeUsername(' ＭＡＮＧＯ ')).toBe('mango'));
 it('可信时间仅格式化，不以 tick 次数累计',()=>{expect(duration(5025)).toBe('01:23:45');expect(duration(0)).toBe('00:00:00');});
 it('批量拆分选项',()=>expect(splitOptions('A. 苹果\nB. 香蕉\nC. 西瓜\nD. 葡萄')).toHaveLength(4));
 it.each([['蘋果','苹果'],['学校','學校']])('繁简等价 %s %s',(key,input)=>{const q={...newQuestion('blank'),answer:[key]};expect(gradeQuestion(q,input).score).toBe(5);});
 it('仅繁体拒绝简体、接受由简体标准答案转换的繁体',()=>{const q={...newQuestion('blank'),answer:['苹果'],traditionalOnly:true};expect(gradeQuestion(q,'苹果').score).toBe(0);expect(gradeQuestion(q,'蘋果').score).toBe(5);});
 it('繁简相同汉字不被误判',()=>expect(gradeQuestion({...newQuestion('blank'),answer:['中文'],traditionalOnly:true},'中文').score).toBe(5));
 it('多空按权重评分',()=>expect(gradeQuestion({...newQuestion('blanks'),answer:[['蘋果'],['学校']],blankPoints:[2,3]},['苹果','错']).score).toBe(2));
 it('多选部分分扣除错选',()=>{const q={...newQuestion('multiple'),answer:[0,1],partial:true};expect(gradeQuestion(q,[0]).score).toBe(2.5);expect(gradeQuestion(q,[0,2]).score).toBe(0);});
 it('数值分数及误差',()=>{expect(numberValue('-1/2')).toBe(-0.5);expect(gradeQuestion({...newQuestion('numeric'),answer:0.5},'1/2').score).toBe(5);expect(numberValue('1/0')).toBeNaN();});
 it('人工题不能冒充最终成绩',()=>expect(gradeExam([newQuestion('drawing')],{}).grading_status).toBe('pending'));
 it('排序严格检查位置',()=>{const q={...newQuestion('ordering'),answer:[2,0,1]};expect(gradeQuestion(q,[2,0,1]).score).toBe(5);expect(gradeQuestion(q,[0,1,2]).score).toBe(0);});
 it('热点依据结构化区域',()=>expect(gradeQuestion({...newQuestion('hotspot'),answer:{x:50,y:50,radius:10}},{x:55,y:50}).score).toBe(5));
});
