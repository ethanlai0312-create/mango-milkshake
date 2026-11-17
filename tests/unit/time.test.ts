import {describe,it,expect} from 'vitest';
import {beijingTime,beijingToday} from '../../src/lib/time';
describe('Beijing calendar display',()=>{
 it('converts UTC across midnight, retaining seconds',()=>expect(beijingTime('2026-10-28T16:00:01Z')).toBe('2026-10-29 00:00:01 北京时间'));
 it('normalizes explicit offsets to UTC+8',()=>expect(beijingTime('2026-10-29T01:02:03-07:00')).toBe('2026-10-29 16:02:03 北京时间'));
 it('uses next Beijing day for home date',()=>expect(beijingToday(new Date('2026-10-28T16:01:00Z'))).toContain('10月29日'));
 it('handles missing and invalid timestamps',()=>{expect(beijingTime(null,'尚未登录')).toBe('尚未登录');expect(beijingTime('invalid')).toBe('—');});
});
