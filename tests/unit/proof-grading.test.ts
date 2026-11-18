import {it,expect} from 'vitest';
import {gradeQuestion} from '../../shared/grading';
import {buildManualReview} from '../../shared/manual-review';
const q:any={id:'11111111-1111-4111-8111-111111111111',kind:'proof',prompt:'证明',points:5,options:[],answer:'∵ 已知 ∴ 得证',explanation:'',traditionalOnly:false,ignoreCase:true,ignorePunctuation:false,partial:false,shuffle:false,attachments:[],tolerance:0,blankPoints:[]};
it('keeps proof answers pending until a teacher grades them',()=>{
 expect(gradeQuestion(q,'∵ 因为')).toEqual({score:null,status:'pending'});
});
it('accepts a proof score in the manual review',()=>{
 const result=buildManualReview([q],null,{scores:{[q.id]:4}},{});
 expect(result.errors).toEqual([]);
 expect(result.grades[q.id]).toMatchObject({score:4,status:'final'});
});
