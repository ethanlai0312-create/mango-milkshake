import {describe,it,expect,vi} from 'vitest';
import {preloadedModule} from '../../shared/preloaded-module';

describe('document modules without Suspense handoff delays',()=>{
 it('shares an in-flight load and exposes the resolved component synchronously',async()=>{
  let finish!:(value:()=>null)=>void;
  const loader=vi.fn(()=>new Promise<()=>null>(resolve=>{finish=resolve;}));
  const resource=preloadedModule(loader),listener=vi.fn(),Page=()=>null;
  const off=resource.subscribe(listener),first=resource.load(),second=resource.load();
  expect(first).toBe(second);expect(resource.getSnapshot().value).toBeUndefined();
  await Promise.resolve();finish(Page);await first;
  expect(resource.getSnapshot().value).toBe(Page);const stable=resource.getSnapshot();
  await resource.load();expect(resource.getSnapshot()).toBe(stable);expect(loader).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledTimes(1);off();
 });
 it('allows a failed module to be retried without retaining a rejected promise',async()=>{
  const Page=()=>null,loader=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Page),resource=preloadedModule(loader);
  await expect(resource.load()).rejects.toThrow('offline');expect(resource.getSnapshot().error?.message).toBe('offline');
  await resource.load();expect(resource.getSnapshot().value).toBe(Page);expect(resource.getSnapshot().error).toBeUndefined();
 });
 it('captures a synchronous loader failure and respects unsubscribe',async()=>{
  const resource=preloadedModule(()=>{throw new Error('module unavailable');}),listener=vi.fn(),off=resource.subscribe(listener);
  off();await expect(resource.load()).rejects.toThrow('module unavailable');expect(listener).not.toHaveBeenCalled();expect(resource.getSnapshot().error).toBeInstanceOf(Error);
 });
});
