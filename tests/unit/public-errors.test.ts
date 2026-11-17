import {describe,it,expect} from 'vitest';
import {databaseError,publicError,PublicApiError} from '../../shared/public-errors';

describe('public error boundary',()=>{
 it('does not return arbitrary runtime/provider text or spoofed status values',()=>{
  for(const error of [new Error('private runtime diagnostic'),{message:'private response',status:401,code:'example'},null]){
   expect(publicError(error)).toEqual({status:500,error:'服务暂时无法完成操作，请稍后重试',code:undefined});
  }
  for(const error of [{code:'P0001',message:'private trigger diagnostic'},{code:'UNKNOWN',message:'private provider diagnostic'}]){
   expect(publicError(databaseError(error)).error).toBe('服务暂时无法完成操作，请稍后重试');
  }
 });
 it('retains intended business feedback, conflicts and authoritative expiry codes',()=>{
  expect(publicError(databaseError({code:'P0001',message:'密令无效、过期或已用尽'}))).toMatchObject({status:400,error:'密令无效、过期或已用尽'});
  expect(publicError(databaseError({code:'P0001',message:'CONFLICT:其他设备已有新答案'}))).toMatchObject({status:409});
  expect(publicError(databaseError({code:'P0001',message:'转换配额已满：每个账号最多8个待处理任务'}))).toMatchObject({status:429});
  expect(publicError(new PublicApiError('请重新登录',401,'SESSION_EXPIRED'))).toEqual({status:401,error:'请重新登录',code:'SESSION_EXPIRED'});
 });
 it('keeps unique-key and permission diagnostics stable without database details',()=>{
  expect(databaseError({code:'23505',message:'private index name'})).toMatchObject({status:409,message:'记录已存在或请求重复，请刷新后重试'});
  expect(databaseError({code:'42501',message:'private role name'})).toMatchObject({status:403,message:'无权限执行此操作'});
 });
});
