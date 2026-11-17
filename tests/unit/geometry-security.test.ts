import {describe,it,expect} from 'vitest';
import {createDrawing,createObject,addObject,validateDrawing,snapPoint,resolveAnchor,undoDrawing,type DrawingDocument} from '../../shared/geometry';
import {perpendicularBisectorFixture} from '../fixtures/geometry-docs';

describe('严格尺规原始数据安全边界',()=>{
 const fixture=perpendicularBisectorFixture();
 const invalid=(mutate:(d:DrawingDocument)=>void)=>{const d=structuredClone(fixture.document);mutate(d);expect(validateDrawing(d,{mode:'strict',initial:fixture.initial}).length).toBeGreaterThan(0);};
 it.each(['ballpoint','highlighter','pencil','fountain','protractor','setSquare','eraser'])('拒绝隐藏工具%s，即使最终画面合法',tool=>invalid(d=>{d.steps[0].tool=tool;}));
 it('不先规范化再校验，拒绝原始非法字段、无限值和未回放的对象',()=>{
  invalid(d=>{(d as any).forgedScore=100;});invalid(d=>{d.objects.at(-1)!.points[0].x=Infinity;});invalid(d=>{d.objects.push(createObject('point',[{x:100,y:100}]));});
 });
 it('快捷画圆不能通过更换tool文字伪装成尺规过程',()=>{
  const d=addObject(createDrawing('strict',fixture.initial),createObject('circle',[{x:200,y:250},{x:450,y:250}]),'compass');
  expect(validateDrawing(d,{mode:'strict',initial:fixture.initial}).join()).toContain('锁定半径');
 });
 it('圆规运动采样改变半径、缺少真实整周或记录错误开口均被拒绝',()=>{
  invalid(d=>{d.steps.find(s=>s.operation==='create'&&s.tool==='compass')!.parameters!.motion![4].x+=10;});
  invalid(d=>{d.steps.find(s=>s.operation==='create'&&s.tool==='compass')!.parameters!.sweep=Math.PI;});
  invalid(d=>{d.steps.find(s=>s.operation==='create'&&s.tool==='compass')!.toolBefore!.compass!.radius+=1;});
 });
 it('不能篡改撤销目标或在步骤之外补入修改结果',()=>{
  const d=undoDrawing(fixture.document);expect(validateDrawing(d,{mode:'strict',initial:fixture.initial})).toEqual([]);
  d.steps.at(-1)!.parameters!.targetStepId='invented-step';expect(validateDrawing(d,{mode:'strict',initial:fixture.initial}).length).toBeGreaterThan(0);
 });
 it('严格吸附不会免费生成中点，合法交点则带可验证引用',()=>{
  const objects=createDrawing('strict',fixture.initial).objects,mid={x:400,y:250};expect(snapPoint(mid,objects,{mode:'strict',threshold:10})).toBeNull();expect(snapPoint(mid,objects,{mode:'free',threshold:10})?.kind).toBe('midpoint');
  const upper=fixture.line.points[0],snap=snapPoint(upper,fixture.document.objects.filter(o=>o.type!=='line'),{mode:'strict',threshold:10});expect(snap?.kind).toBe('intersection');expect(snap?.anchor&&resolveAnchor(snap.anchor,fixture.document.objects)).toEqual(upper);
 });
 it('圆上内部定义点不等同已构造端点，不能拿它绕过作图规则',()=>{
  const circle=fixture.circles[0];expect(resolveAnchor({kind:'point',objectId:circle.id,pointIndex:1},fixture.document.objects)).toBeNull();
 });
});
