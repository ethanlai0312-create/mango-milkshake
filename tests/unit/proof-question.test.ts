import {it,expect} from 'vitest';
import {newQuestion} from '../../shared/model';
import {validateQuestion} from '../../shared/validation';
import {answerComplete} from '../../shared/attempt-review';
import {validateAnswers} from '../../shared/answers';
import {proofSymbols} from '../../src/components/ProofInput';
it('creates a proof question without choice options and with a text answer',()=>{
 const q=newQuestion('proof');
 expect(q.kind).toBe('proof');
 expect(q.options).toEqual([]);
 expect(q.answer).toBe('');
});
it('validates a published proof question and its text answers',()=>{
 const q={...newQuestion('proof'),prompt:'证明：△ABC≌△DEF',answer:'∵ AB=DE，∠A=∠D，∴ △ABC≌△DEF'};
 expect(validateQuestion(q,true)).toEqual([]);
 expect(answerComplete(q,'∵ 已知')).toBe(true);
 expect(validateAnswers([q],{[q.id]:'∵ 已知\n∴ 得证'})).toEqual([]);
});
it('provides the requested proof symbol buttons',()=>{
 const glyphs=proofSymbols.map(item=>item.glyph);
 for(const glyph of ['∵','∴','∠','△','≅','⊥','∥','>','<','≥','≤','=','≠'])expect(glyphs).toContain(glyph);
});
