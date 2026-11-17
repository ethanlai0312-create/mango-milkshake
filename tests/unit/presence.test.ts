import {describe,it,expect} from 'vitest';
import {validPresenceId,validPresenceUpdate,PRESENCE_HEARTBEAT_MS,PRESENCE_REFRESH_MS,PRESENCE_TIMEOUT_SECONDS} from '../../shared/presence';
const id='5370c8ea-bdf0-4fbf-94cd-9838a5e99124';
describe('在线状态输入与刷新规则',()=>{
 it('每秒刷新，心跳留有网络抖动窗口',()=>{expect(PRESENCE_REFRESH_MS).toBe(1000);expect(PRESENCE_HEARTBEAT_MS).toBe(5000);expect(PRESENCE_TIMEOUT_SECONDS).toBe(15);});
 it('接受独立标签页及单调序号',()=>{expect(validPresenceUpdate(id,1,true)).toBe(true);expect(validPresenceUpdate(id,2,false)).toBe(true);});
 it('拒绝伪造类型或不安全序号',()=>{for(const value of [-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1,'1'])expect(validPresenceUpdate(id,value,true)).toBe(false);expect(validPresenceUpdate('invalid',1,true)).toBe(false);expect(validPresenceUpdate(id,1,'true')).toBe(false);expect(validPresenceId(null)).toBe(false);});
});
