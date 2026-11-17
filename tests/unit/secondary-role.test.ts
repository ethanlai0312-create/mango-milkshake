import {it,expect} from 'vitest';
import {roleAllows,roleLabel,nonDestructiveExamChange} from '../../shared/roles';
import {pageFromHash} from '../../shared/navigation';
it('secondary is a real business manager without account, security or destructive access',()=>{
 for(const action of ['getExam','createExam','saveExam','submitReview','copyExam','grade','updateFile','fileUrl','upload','historyQuery','users','userPresence','invites','createInvite','revokeInvite','logs','config'])expect(roleAllows('secondary_admin',action)).toBe(true);
 expect(roleAllows('secondary_admin','exams',{mode:'admin'})).toBe(true);expect(roleAllows('secondary_admin','historyQuery',{all:true})).toBe(true);
 for(const action of ['saveConfig','setUserRole','userState','purgeAccount','resetPassword','deleteExam','purgeExam','deleteFile','replaceShared','deleteConversion','cancelConversion','unknown'])expect(roleAllows('secondary_admin',action)).toBe(false);
 for(const decision of ['publish','return'])expect(roleAllows('secondary_admin','review',{decision})).toBe(true);
 for(const decision of ['unpublish','restore','delete',''])expect(roleAllows('secondary_admin','review',{decision})).toBe(false);
 expect(roleAllows('secondary_admin','exams',{mode:'trash'})).toBe(false);
});
it('secondary routes show only the business management functions',()=>{expect(['admin','secondary_admin','tester','visitor'].map(roleLabel)).toEqual(['primary admin','secondary admin','tester','user']);for(const page of ['review','grading','users','invites','logs','config'])expect(pageFromHash('#'+page,'secondary_admin')).toBe(page);for(const page of ['trash'])expect(pageFromHash('#'+page,'secondary_admin')).toBeNull();});

it('nested exam writes cannot remove saved content or indirectly unpublish',()=>{const q={id:'one',kind:'single',options:['A','B'],attachments:['file']},before={status:'draft',questions:[q]};expect(nonDestructiveExamChange(before,{questions:[{...q,prompt:'changed'}]})).toBeUndefined();expect(nonDestructiveExamChange(before,{questions:[q,{...q,id:'two'}]})).toBeUndefined();for(const questions of [[],[{...q,kind:'short'}],[{...q,options:['A']}],[{...q,attachments:[]}]])expect(nonDestructiveExamChange(before,{questions})).toBeDefined();expect(nonDestructiveExamChange({...before,status:'published'},before)).toBeDefined();});
