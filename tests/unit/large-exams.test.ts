import {it,expect} from 'vitest';
import {newQuestion} from '../../shared/model';
import {validateStructure} from '../../shared/validation';
it('支持2000题并保留数量与重复ID校验',()=>{
 const exam={title:'large',subject:'AI',description:'',tags:[],time_limit:0,repeat_allowed:true,reveal_answers:true,show_explanations:true,questions:Array.from({length:2000},()=>({...newQuestion('boolean'),prompt:'<p>test</p>',answer:'true'}))};
 expect(validateStructure(exam,true)).toEqual([]);
 expect(validateStructure({...exam,questions:[...exam.questions,newQuestion()]}).some(e=>e.includes('2000'))).toBe(true);
 expect(validateStructure({...exam,questions:[exam.questions[0],exam.questions[0]]}).some(e=>e.includes('重复'))).toBe(true);
});
