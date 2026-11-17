import {it,expect} from 'vitest';
import {deliveredExam,canonicalAnswers,publicAttempt,createDeliveryMap} from '../../shared/delivery';
import {newQuestion,type Exam} from '../../shared/model';
const q={...newQuestion('matching'),options:['猫↔Cat','狗↔Dog','鸟↔Bird'],answer:[0,1,2]};const exam={questions:[q]} as Exam;
it('public pair rows no longer carry the canonical right-side alignment or answer key',()=>{const delivered=deliveredExam(exam,{pairs:{[q.id]:[2,0,1]}},false);expect(delivered.questions[0].options).toEqual(['猫↔Bird','狗↔Cat','鸟↔Dog']);expect(delivered.questions[0]).not.toHaveProperty('answer');expect(delivered.questions[0]).not.toHaveProperty('explanation');});
it('grades public indices against canonical answers and reveals the matching public answer later',()=>{const map={pairs:{[q.id]:[2,0,1]}};expect(canonicalAnswers({[q.id]:[1,2,0]},map)[q.id]).toEqual([0,1,2]);expect(deliveredExam(exam,map,true).questions[0].answer).toEqual([1,2,0]);});
it('delivery mappings never leave the trusted attempt representation',()=>expect(publicAttempt({id:'a',answers:{},delivery_map:{pairs:{secret:[1,0]}}})).toEqual({id:'a',answers:{}}));
it('new random mappings are valid complete permutations; old records retain their original indices',()=>{const order=createDeliveryMap(exam).pairs![q.id];expect([...order].sort()).toEqual([0,1,2]);expect(canonicalAnswers({[q.id]:[0,1,2]},{legacy:true})[q.id]).toEqual([0,1,2]);});
it('omits hidden explanations from submitted visitor responses while keeping permitted answer keys',()=>{
 const question={...newQuestion('single'),answer:1,explanation:'仅供批改的说明'};
 const hidden={questions:[question],show_explanations:false} as Exam;
 const result=deliveredExam(hidden,{},true);
 expect(result.questions[0]).toHaveProperty('answer',1);
 expect(result.questions[0]).not.toHaveProperty('explanation');
 expect(question.explanation).toBe('仅供批改的说明');
 expect(deliveredExam({...hidden,show_explanations:true},{},true).questions[0].explanation).toBe(question.explanation);
});
it('preserves administrator drawing review and reference release boundaries independently of explanation visibility',()=>{
 const drawing={...newQuestion('drawing'),answer:{sample:true},explanation:'参考步骤说明'};
 const hidden={questions:[drawing],show_explanations:false} as Exam;
 expect(deliveredExam(hidden,{},true).questions[0]).not.toHaveProperty('answer');
 const released=deliveredExam(hidden,{},true,{released:{[drawing.id]:true}}).questions[0];
 expect(released.answer).toEqual(drawing.answer);
 expect(released).not.toHaveProperty('explanation');
 const reviewed=deliveredExam(hidden,{},true,{admin:true}).questions[0];
 expect(reviewed.answer).toEqual(drawing.answer);
 expect(reviewed.explanation).toBe(drawing.explanation);
});
