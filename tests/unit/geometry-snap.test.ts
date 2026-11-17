import {describe,it,expect} from 'vitest';
import {createObject,createStroke,resolveAnchor,snapPoint,type GeometryObject} from '../../shared/geometry';

describe('按模式约束的智能吸附',()=>{
 it('严格模式允许已有端点与真实交点，不吸附网格、中点或投影',()=>{
  const a=createObject('segment',[{x:0,y:0},{x:100,y:0}]),b=createObject('line',[{x:70,y:-50},{x:70,y:50}]),objects=[a,b];
  expect(snapPoint({x:1,y:1},objects,{mode:'strict'})?.kind).toBe('endpoint');
  const meet=snapPoint({x:72,y:1},objects,{mode:'strict'});expect(meet?.kind).toBe('intersection');expect(meet?.point).toEqual({x:70,y:0});expect(resolveAnchor(meet!.anchor!,objects)).toEqual(meet?.point);
  expect(snapPoint({x:50,y:1},[a],{mode:'strict',grid:10})).toBeNull();expect(snapPoint({x:32,y:1},[a],{mode:'strict',grid:10})).toBeNull();expect(snapPoint({x:10.2,y:20.2},[],{mode:'strict',grid:10})).toBeNull();
 });
 it('自由模式支持中点、网格、线投影、圆周以及水平垂直',()=>{
  const segment=createObject('segment',[{x:0,y:0},{x:100,y:0}]);expect(snapPoint({x:50,y:1},[segment])?.kind).toBe('midpoint');expect(snapPoint({x:30,y:1},[segment])?.kind).toBe('onLine');
  expect(snapPoint({x:19,y:31},[],{grid:10})?.point).toEqual({x:20,y:30});
  const circle=createObject('circle',[{x:0,y:0},{x:30,y:0}]);expect(snapPoint({x:29,y:1},[circle])?.kind).toBe('onCircle');
  expect(snapPoint({x:31,y:2},[],{origin:{x:0,y:0}})?.kind).toBe('horizontal');expect(snapPoint({x:2,y:31},[],{origin:{x:0,y:0}})?.kind).toBe('vertical');
 });
 it('吸附阈值按缩放和触控设备调整，不改变数学坐标',()=>{
  const object=createObject('point',[{x:100,y:100}]);expect(snapPoint({x:106,y:100},[object],{mode:'strict',zoom:2})).toBeNull();expect(snapPoint({x:106,y:100},[object],{mode:'strict',zoom:2,pointerType:'touch'})?.point).toEqual({x:100,y:100});
 });
 it('仍有效的前一目标具有释放滞回，但不能从自由模式带入非法吸附',()=>{
  const a=createObject('point',[{x:0,y:0}]),b=createObject('point',[{x:8,y:0}]),previous=snapPoint({x:1,y:0},[a,b],{mode:'strict'});
  expect(snapPoint({x:6,y:0},[a,b],{mode:'strict',previous})?.objectIds).toEqual([a.id]);
  const line=createObject('segment',[{x:0,y:0},{x:100,y:0}]),middle=snapPoint({x:50,y:0},[line]);expect(snapPoint({x:50,y:0},[line],{mode:'strict',previous:middle})).toBeNull();
 });
 it('不可见对象及自由笔迹不提供严格构造锚点',()=>{
  const hidden=createObject('point',[{x:1,y:1}],{visible:false}),stroke=createStroke([{x:0,y:0},{x:10,y:10}]);expect(snapPoint({x:1,y:1},[hidden,stroke],{mode:'strict'})).toBeNull();
 });
 it('大量手写与重叠圆的交点候选有界且不会产生非数坐标',()=>{
  const objects:GeometryObject[]=Array.from({length:500},(_,i)=>createStroke([{x:i,y:0},{x:i,y:100}]));for(let i=0;i<150;i++)objects.push(createObject('circle',[{x:i*.01,y:0},{x:50+i*.01,y:0}]));
  const result=snapPoint({x:50,y:0},objects,{mode:'strict'});expect(result===null||Number.isFinite(result.point.x)&&Number.isFinite(result.point.y)).toBe(true);
 });
});
