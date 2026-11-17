import {it,expect,vi} from 'vitest';
import {deadline} from '../../src/lib/deadline';
it('returns successful work and cleans its deadline',async()=>{vi.useFakeTimers();try{await expect(deadline(Promise.resolve(7),100,'timeout')).resolves.toBe(7);expect(vi.getTimerCount()).toBe(0);}finally{vi.useRealTimers();}});
it('ends waiting for a stalled initializer',async()=>{vi.useFakeTimers();try{const result=expect(deadline(new Promise(()=>{}),100,'连接超时')).rejects.toThrow('连接超时');await vi.advanceTimersByTimeAsync(100);await result;expect(vi.getTimerCount()).toBe(0);}finally{vi.useRealTimers();}});
it('preserves the original authorization error',async()=>{await expect(deadline(Promise.reject(new Error('unauthorized')),100,'timeout')).rejects.toThrow('unauthorized');});
