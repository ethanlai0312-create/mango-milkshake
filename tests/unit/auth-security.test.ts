import {describe,it,expect,vi} from 'vitest';
import {inviteUsable,loginFailureTarget,padLoginFailure,publicConfiguration,retryAfterSeconds} from '../../shared/auth-security';
describe('auth entry hardening',()=>{
 it.each([0,.4,.99])('pads short and long account failure paths to independent target %s',async(random)=>{
  const target=loginFailureTarget(random),short=vi.fn().mockResolvedValue(undefined),long=vi.fn().mockResolvedValue(undefined);
  await padLoginFailure(100,target,()=>200,short);await padLoginFailure(100,target,()=>450,long);
  expect(short).toHaveBeenCalledWith(target-100);expect(long).toHaveBeenCalledWith(target-350);
  expect(target).toBeGreaterThanOrEqual(650);expect(target).toBeLessThanOrEqual(725);
 });
 it('never adds negative delay when the backend is already slower than the floor',async()=>{
  const sleep=vi.fn();await padLoginFailure(0,650,()=>800,sleep);expect(sleep).not.toHaveBeenCalled();
 });
 it('validates invitation existence, revocation, expiry and capacity before account logic',()=>{
  const now=1000,base={revoked:false,expires_at:new Date(2000).toISOString(),used:0,max_uses:2};expect(inviteUsable(base,now)).toBe(true);
  for(const row of [null,undefined,{...base,revoked:true},{...base,expires_at:new Date(500).toISOString()},{...base,used:2},{...base,used:NaN}])expect(inviteUsable(row,now)).toBe(false);
 });
 it('redacts internal endpoints without changing stored configuration values',()=>{
  const rows=[{key:'converter_url',value:'http://converter:10000'},{key:'registration_enabled',value:true}];
  const result=publicConfiguration(rows);expect(JSON.stringify(result)).not.toContain('converter:10000');expect(rows[0].value).toBe('http://converter:10000');expect(result[1].value).toBe(true);
 });
 it('bounds Retry-After metadata',()=>{expect(retryAfterSeconds(900)).toBe('900');expect(retryAfterSeconds(0)).toBe('1');expect(retryAfterSeconds(9999)).toBe('3600');});
});
