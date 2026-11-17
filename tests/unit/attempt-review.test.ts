import {it,expect} from 'vitest';
import {answerComplete,firstIncomplete,questionResult} from '../../shared/attempt-review';
import {newQuestion} from '../../shared/model';
it('uses authoritative score and never marks pending review as a zero',()=>{
 const q={points:2};expect(questionResult(q,{score:0,status:'final'})).toBe('wrong');expect(questionResult(q,{score:0.5,status:'final'})).toBe('partial');expect(questionResult(q,{score:2,status:'final'})).toBe('correct');for(const grade of [undefined,{score:null},{score:0,status:'pending'}])expect(questionResult(q,grade)).toBe('pending');
});
it('chooses the lowest unfinished ordinal and treats zero/false answers as completed',()=>{
 const a=newQuestion('single'),b=newQuestion('boolean'),c=newQuestion('short');expect(firstIncomplete([a,b,c],{[a.id]:0,[b.id]:'false',[c.id]:' '})).toBe(2);expect(firstIncomplete([a,b],{[a.id]:0,[b.id]:'false'})).toBe(-1);expect(firstIncomplete([a,b],{})).toBe(0);
});
it('checks all blanks/pairs and explicit ordering confirmation',()=>{
 for(const kind of ['blanks','table','matching','connection','ordering'] as const){const q=newQuestion(kind);expect(answerComplete(q,[])).toBe(false);expect(answerComplete(q,new Array(q.options.length))).toBe(false);expect(answerComplete(q,q.options.map(()=>0))).toBe(true);}expect(answerComplete(newQuestion('multiple'),[])).toBe(false);expect(answerComplete(newQuestion('multiple'),[0])).toBe(true);
});
it('does not count the supplied initial diagram as a completed drawing',()=>{
 const q=newQuestion('drawing');expect(answerComplete(q,{objects:[{locked:true,layer:'initial'}]})).toBe(false);expect(answerComplete(q,{objects:[{locked:false,layer:'geometry'}]})).toBe(true);expect(answerComplete(newQuestion('hotspot'),{x:0,y:0})).toBe(true);
});
