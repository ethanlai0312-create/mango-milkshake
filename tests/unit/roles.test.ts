import {describe,it,expect,vi,afterEach} from 'vitest';
import {roleAllows,roleLabel,testerExamView,testerExamSummary,testerSharedFile} from '../../shared/roles';
import {validateApiInput} from '../../shared/api-input';
import {pageFromHash} from '../../shared/navigation';
import {setReadCacheAccount,captureReadCacheScope,rememberRead,peekRead,retainMedia} from '../../src/lib/read-cache';
const id='60000000-0000-4000-8000-000000000001';
afterEach(()=>{setReadCacheAccount();vi.restoreAllMocks();vi.useRealTimers();});
describe('tester inherits user with private-data isolation',()=>{
 it.each(['me','sessionStatus','sessionActivity','presence','changePassword','exams','testerExam','files','testerFile','getExam','attempt','history','historyQuery','leaderboard','createExam','saveExam','startAttempt','saveAttempt','submitAttempt','upload','renewUpload','verifyUpload','deleteFile','settings','updateAvatar','conversionInputs','conversions','conversionDownload'])('allows personal user action %s',action=>expect(roleAllows('tester',action)).toBe(true));
 it.each(['users','userPresence','adminMfaFactors','logs','invites','config','grade','updateFile','replaceShared','setUserRole','purgeAccount','resetPassword','userState','review','saveConfig','unknown','fileUrl'])('rejects management data/action %s',action=>expect(roleAllows('tester',action)).toBe(false));
 it('rejects admin scopes while retaining personal content',()=>{
  expect(roleAllows('tester','exams',{mode:'mine'})).toBe(true);for(const mode of ['admin','trash'])expect(roleAllows('tester','exams',{mode})).toBe(false);
  for(const action of ['history','historyQuery'])expect(roleAllows('tester',action,{all:true})).toBe(false);
  expect(roleAllows('tester','upload',{purpose:'shared'})).toBe(false);expect(roleAllows('tester','upload',{purpose:'avatar'})).toBe(true);expect(roleAllows('tester','files',{purpose:'conversion'})).toBe(true);
 });
 it('whitelists published content and strips owners, answer keys and geometry actor bindings',()=>{
  const value={id,title:'published',owner_id:'private-owner',review_reason:'private-review',questions:[{id,kind:'drawing',prompt:'<p>题目</p>',points:1,options:[],attachments:[id],answer:{secret:'answer'},explanation:'secret',drawing:{mode:'free',private:'secret',initial:{version:2,mode:'free',objects:[],steps:[{context:{actorId:'secret',attemptId:'secret'}}],secret:'private'}}}]};
  const output:any=testerExamView(value);expect(output.owner_id).toBeUndefined();expect(output.review_reason).toBeUndefined();expect(output.questions[0].answer).toBeUndefined();expect(output.questions[0].explanation).toBeUndefined();expect(output.questions[0].drawing.initial.steps).toEqual([]);expect(JSON.stringify(output)).not.toMatch(/private|secret/);
  output.questions[0].attachments.push('local-edit');expect(value.questions[0].attachments).toEqual([id]);
  expect(testerExamSummary(value)).toEqual({id,title:'published'});
  expect(testerSharedFile({id,name:'public',path:'secret',owner_id:'private',attempt_id:id,verified:true})).toEqual({id,name:'public'});
 });
 it('cannot grant admin or accept stale-role-free updates',()=>{
  expect(validateApiInput({action:'setUserRole',id,role:'tester',expectedRole:'user'})).toHaveProperty('params.role','tester');
  for(const body of [{id,role:'admin',expectedRole:'user'},{id,role:'user',expectedRole:'admin'},{id,role:'tester'},{id,role:'visitor',expectedRole:'user'}])expect(validateApiInput({action:'setUserRole',...body})).toHaveProperty('status',400);
 });
 it('allows tester interface routes without granting admin APIs',()=>{for(const page of ['home','exams','create','mine','history','rank','shared','convert','settings','review','users','invites','grading','trash','logs','config'])expect(pageFromHash('#'+page,'tester')).toBe(page);expect(pageFromHash('#users','visitor')).toBeNull();});
 it('invalidates the same account cache on role changes and rejects late media',()=>{
  vi.useFakeTimers();const revoke=vi.spyOn(URL,'revokeObjectURL');setReadCacheAccount(id,'visitor');const old=captureReadCacheScope(id)!;rememberRead(old,'exams',{},['private draft']);retainMedia(old,'blob:old');
  setReadCacheAccount(id,'tester');expect(peekRead('exams')).toBeUndefined();expect(revoke).toHaveBeenCalledWith('blob:old');rememberRead(old,'exams',{},['late private draft']);expect(peekRead('exams')).toBeUndefined();expect(()=>retainMedia(old,'blob:late')).toThrow();expect(revoke).toHaveBeenCalledWith('blob:late');
  const current=captureReadCacheScope(id)!;retainMedia(current,'blob:current');setReadCacheAccount('another','visitor');expect(revoke).toHaveBeenCalledWith('blob:current');
 });
});
