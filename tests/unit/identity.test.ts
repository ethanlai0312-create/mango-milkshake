import {describe,it,expect} from 'vitest';
import {loginId,loginIdKey,loginIdError,nickname,nicknameError} from '../../shared/identity';
import {validateApiInput} from '../../shared/api-input';
describe('login identity and public nickname',()=>{
 it('accepts four-character IDs, case and internal spaces without changing their display spelling',()=>{
  for(const value of ['user','1234','AbCd','abc 123','Primary Admin','1'.repeat(64)])expect(loginIdError(value)).toBeNull();
  expect(loginId(' AbC 123 ')).toBe('AbC 123');expect(loginIdKey(' AbC 123 ')).toBe('abc 123');
 });
 it('rejects short, non-ASCII, punctuation, controls and excessive IDs',()=>{
  for(const value of ['abc',' a ','a'.repeat(65),'甲乙丙丁','ＡＢＣＤ','a-bc','a_bc','abc\td','ab\ncd','abc🙂',null,{},3])expect(loginIdError(value)).toBeTruthy();
 });
 it('keeps public nicknames case-sensitive and supports Chinese, spaces, punctuation and Unicode',()=>{
  for(const value of ['同名','Alice','a','昵称 ! 🙂','🙂'.repeat(32)])expect(nicknameError(value)).toBeNull();
  expect(nickname('  My Name  ')).toBe('My Name');
  for(const value of ['', '  ','🙂'.repeat(33),'a\nb','ab\u200bcd',null,{}])expect(nicknameError(value)).toBeTruthy();
 });
 it('has no legacy nickname login alias and cannot receive a settings ID mutation',()=>{
  expect(validateApiInput({action:'login',loginId:'AbCd',password:'unchanged'})).toHaveProperty('action','login');
  expect(validateApiInput({action:'login',username:'AbCd',password:'unchanged'})).toHaveProperty('status',400);
  expect(validateApiInput({action:'register',nickname:'重名可用',password:'unchanged',invite:'secret'})).toHaveProperty('action','register');
  expect(validateApiInput({action:'settings',settings:{theme:'dark'},nickname:'重名可用'})).toHaveProperty('action','settings');
  expect(validateApiInput({action:'settings',settings:{theme:'dark'},loginId:'Other'})).toHaveProperty('status',400);
 });
 it('requires a bound ID and disallows multiple-use invitation payloads',()=>{
  expect(validateApiInput({action:'createInvite',loginId:'AbCd',label:'测试备注',hours:24})).toHaveProperty('action','createInvite');
  expect(validateApiInput({action:'createInvite',label:'unbound'})).toHaveProperty('status',400);
  expect(validateApiInput({action:'createInvite',loginId:'AbCd',maxUses:2})).toHaveProperty('status',400);
 });
});
