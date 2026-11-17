import {describe,it,expect} from 'vitest';
import {pageMotion,RouteReadiness,RouteScrollRestore} from '../../shared/page-motion';
describe('page transitions remain visible in both motion preferences',()=>{
 it('uses a short, visible full transition',()=>{const p=pageMotion(false);expect(p.duration).toBeGreaterThanOrEqual(240);expect(p.duration).toBeLessThanOrEqual(320);expect(p.fromOpacity).toBeLessThan(.4);expect(p.distance).toBeGreaterThan(0);});
 it('keeps a pure fade when reduced motion is requested',()=>{const p=pageMotion(true);expect(p.duration).toBeGreaterThan(0);expect(p.duration).toBeLessThanOrEqual(200);expect(p.distance).toBe(0);expect(p.fromOpacity).toBeLessThan(1);});
 it('marks deferred scroll ready after data arrives',()=>{const r=new RouteReadiness(true);expect(r.update(true)).toBe(false);expect(r.update(false)).toBe(true);expect(r.update(false)).toBe(false);});
 it('does not repeat scroll readiness on ordinary updates or pending replacements',()=>{const r=new RouteReadiness();expect(r.update(false)).toBe(false);expect(r.update(true)).toBe(false);expect(r.update(true)).toBe(false);expect(r.update(false)).toBe(true);});
 it('resets readiness when navigation changes the target',()=>{const r=new RouteReadiness(true);r.reset(false);expect(r.update(false)).toBe(false);r.reset(true);expect(r.update(false)).toBe(true);});
 it('unfolds the visible desktop content from the source icon',()=>{
  const origin={x:38,y:200},rect={left:124,top:108,width:1100,height:5000};
  const p=pageMotion(false,{origin,rect,viewport:{width:1440,height:900}});
  expect(p.mode).toBe('flight');expect(p.duration).toBeGreaterThanOrEqual(340);expect(p.duration).toBeLessThanOrEqual(420);
  expect(p.scale).toBeGreaterThanOrEqual(.06);expect(p.scale).toBeLessThanOrEqual(.1);expect(p.transformOrigin).toBe('-86px 92px');
  expect(origin.x+p.scale*(674-origin.x)+p.translation.x).toBeCloseTo(origin.x);
  expect(origin.y+p.scale*(504-origin.y)+p.translation.y).toBeCloseTo(origin.y);
  expect(p.toTransform).toBe('translate3d(0,0,0) scale(1)');
 });
 it('keeps a mobile flight short and its visible centre attached to the icon',()=>{
  const p=pageMotion(false,{origin:{x:28,y:140},rect:{left:16,top:96,width:358,height:1000},viewport:{width:390,height:844}});
  expect(p.mode).toBe('flight');expect(p.scale).toBe(.1);expect(p.duration).toBe(360);
  expect(28+p.scale*(195-28)+p.translation.x).toBeCloseTo(28);
  expect(140+p.scale*(470-140)+p.translation.y).toBeCloseTo(140);
 });
 it('does not fly under reduced motion even when an icon origin exists',()=>{
  const p=pageMotion(true,{origin:{x:28,y:140},rect:{left:16,top:96,width:358,height:1000},viewport:{width:390,height:844}});
  expect(p.mode).toBe('reduced');expect(p.scale).toBe(1);expect(p.distance).toBe(0);expect(p.duration).toBeLessThanOrEqual(200);
  expect(p.fromTransform).not.toContain('scale(');
 });
 it('falls back safely for an invalid icon origin',()=>{
  const p=pageMotion(false,{origin:{x:NaN,y:100},rect:{left:10,top:100,width:500,height:200},viewport:{width:800,height:600}});
  expect(p.mode).toBe('full');expect(p.fromTransform).not.toContain('NaN');
 });
 it('anchors the actually visible portion after a long history scroll',()=>{
  const origin={x:38,y:200},p=pageMotion(false,{origin,rect:{left:124,top:-2000,width:1100,height:5000},viewport:{width:1440,height:900}});
  expect(p.mode).toBe('flight');
  expect(origin.y+p.scale*(450-origin.y)+p.translation.y).toBeCloseTo(origin.y);
 });
 it('uses the intersection midpoint when only the end of a page remains visible',()=>{
  const origin={x:38,y:200},p=pageMotion(false,{origin,rect:{left:124,top:-2000,width:1100,height:2300},viewport:{width:1440,height:900}});
  expect(origin.y+p.scale*(150-origin.y)+p.translation.y).toBeCloseTo(origin.y);
 });
});

describe('route scroll restoration follows readiness and user intent',()=>{
 it('restores a clamped history position only once real content can hold it',()=>{
  const restore=new RouteScrollRestore();let position=0,maximum=200;const read=()=>position,write=(top:number)=>{position=Math.min(top,maximum);};
  restore.reset(1800);expect(restore.restore(read,write,false)).toBe(true);expect(position).toBe(200);
  maximum=3000;expect(restore.restore(read,write,true)).toBe(true);expect(position).toBe(1800);
  position=900;expect(restore.restore(read,write,true)).toBe(false);expect(position).toBe(900);
 });
 it('keeps ordinary forward navigation at the top and cancels pending restoration on input',()=>{
  const restore=new RouteScrollRestore();let position=500;const read=()=>position,write=(top:number)=>{position=top;};
  restore.reset(0);expect(restore.restore(read,write,true)).toBe(true);expect(position).toBe(0);
  restore.reset(1200);restore.cancel();expect(restore.restore(read,write,true)).toBe(false);expect(position).toBe(0);
 });
});
