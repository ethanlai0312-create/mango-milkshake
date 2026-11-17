import {describe,it,expect} from 'vitest';
import {addObject,angleBetween,createDrawing,createObject,createQuickShape,createStroke,deleteObjects,distance,geometryConstraintErrors,lockInitialDrawing,migrateLegacy,moveVertex,normalizeDrawing,PEN_STYLES,pointOnCircle,recordStep,redoDrawing,replayDrawing,replayStepProgress,setToolState,smoothStrokePath,strokeWidth,translateObject,undoDrawing,updateObjects,validateDrawing,validateInitialDrawing,type DrawingDocument,type GeometryObject,type GeometryType,type Point} from '../../shared/geometry';
import {angleBisectorFixture,perpendicularBisectorFixture} from '../fixtures/geometry-docs';

describe('独立笔迹样式与受约束快捷图形',()=>{
 it('创建时深拷贝各笔迹样式与压感采样，不随默认值变化',()=>{
  const style={color:'#112233',width:1,opacity:.28},points=[{x:1,y:2,pressure:.3},{x:4,y:8,pressure:.8}];
  const first=createStroke(points,'highlighter',style);style.width=6;style.opacity=.4;points[0].x=999;
  const second=createStroke(points,'highlighter',style);expect(first.style).toMatchObject({width:1,opacity:.28});expect(first.points[0]).toMatchObject({x:1,pressure:.3});expect(second.style).toMatchObject({width:6,opacity:.4});expect(PEN_STYLES.highlighter.opacity).toBe(.28);
  expect(smoothStrokePath(first.points)).toBe(smoothStrokePath(structuredClone(first.points)));expect(geometryConstraintErrors(first)).toEqual([]);const pencil=createStroke(points,'pencil');expect(strokeWidth(pencil,{x:0,y:0,pressure:0})).toBeLessThan(strokeWidth(pencil,{x:0,y:0,pressure:.8}));expect(strokeWidth(pencil,{x:0,y:0})).toBe(pencil.style.width);
 });
 it.each(['rectangle','square','isoscelesTriangle','equilateralTriangle','rightTriangle','parallelogram','rhombus','trapezoid'] as GeometryType[])('快捷%s保留数学约束',type=>{
  const shape=createQuickShape(type,{x:10,y:20},{x:180,y:130});expect(geometryConstraintErrors(shape)).toEqual([]);
 });
 it.each(['square','rectangle','equilateralTriangle'] as GeometryType[])('%s每个顶点无移动时形状及点序不变，实际编辑后约束仍成立',type=>{
  const shape=createQuickShape(type,{x:0,y:0},{x:100,y:100});
  for(let i=0;i<shape.points.length;i++){
   expect(moveVertex(shape,i,shape.points[i])).toEqual(shape);
   const moved=moveVertex(shape,i,{x:shape.points[i].x+17,y:shape.points[i].y+31});expect(geometryConstraintErrors(moved)).toEqual([]);
   const winding=(p:Point[])=>Math.sign(p.reduce((sum,point,index)=>sum+point.x*p[(index+1)%p.length].y-point.y*p[(index+1)%p.length].x,0));
   expect(winding(moved.points)).toBe(winding(shape.points));
  }
 });
 it('不能通过不支持的顶点编辑把菱形或特殊三角形变成任意多边形',()=>{
  for(const type of ['rhombus','isoscelesTriangle','rightTriangle','trapezoid'] as GeometryType[]){const shape=createQuickShape(type,{x:0,y:0},{x:100,y:100});expect(moveVertex(shape,0,{x:300,y:120})).toEqual(shape);expect(geometryConstraintErrors(translateObject(shape,30,40))).toEqual([]);}
 });
 it('创建器忽略runtime options里的旧points/type，快捷圆半径随拖动更新',()=>{
  const old=createObject('circle',[{x:0,y:0},{x:0,y:0}]);const next=createQuickShape('circle',{x:10,y:20},{x:40,y:60},{...old} as any);expect(next.points).toEqual([{x:10,y:20},{x:40,y:60}]);expect(next.center).toEqual({x:10,y:20});expect(next.radius).toBe(50);
  expect(createObject('segment',[{x:0,y:0},{x:1,y:1}],{type:'point',points:[{x:9,y:9}]} as any).type).toBe('segment');
 });
});

describe('保存、历史回放、擦除与旧记录兼容',()=>{
 it('新笔迹保留无关对象和旧步骤的引用，同时更新、撤销及回放不修改历史',()=>{
  const old=addObject(createDrawing(),createStroke([{x:0,y:0},{x:10,y:10}]),'ballpoint'),snapshot=JSON.stringify(old);
  const next=addObject(old,createStroke([{x:20,y:0},{x:30,y:10}]),'ballpoint');
  expect(next.objects[0]).toBe(old.objects[0]);expect(next.steps[0]).toBe(old.steps[0]);expect(old.steps).toHaveLength(1);
  const edited=updateObjects(next,[{...next.objects[1],style:{...next.objects[1].style,width:4}}]);
  expect(JSON.stringify(old)).toBe(snapshot);expect(next.objects[1].style.width).toBe(1.8);expect(validateDrawing(edited)).toEqual([]);
  expect(replayDrawing(edited).objects).toEqual(edited.objects);expect(undoDrawing(edited).objects).toEqual(next.objects);
 });
 it('空数组在严格模式中是新文档，不被标为旧版绘图',()=>{
  const doc=normalizeDrawing([],'strict');expect(doc.legacy).toBeUndefined();expect(validateDrawing(doc,{mode:'strict'})).toEqual([]);
 });
 it('逐步/最终回放与序列化恢复保留所有独立样式及工具姿态',()=>{
  let doc=createDrawing();doc=setToolState(doc,{activeTool:'ballpoint',pen:{position:{x:0,y:0},angle:-1}},'ballpoint',{gesture:'select'});
  doc=addObject(doc,createStroke([{x:10,y:10,pressure:.3},{x:40,y:70,pressure:.8}]),'ballpoint');doc=addObject(doc,createStroke([{x:10,y:40},{x:70,y:40}],'highlighter'),'highlighter');
  const restored=JSON.parse(JSON.stringify(doc));expect(validateDrawing(restored)).toEqual([]);expect(replayDrawing(restored).objects).toEqual(doc.objects);expect(replayDrawing(restored).toolState).toEqual(doc.toolState);expect(replayDrawing(restored,1).objects).toEqual([]);
  const half=replayStepProgress(doc,2,.4);expect(half.objects.at(-1)?.style.opacity).toBe(.28);expect(half.objects.at(-1)?.points).toHaveLength(1);
 });
 it('撤销与重做记录真实逆操作并还原对象图层顺序',()=>{
  let doc=createDrawing();for(let i=0;i<3;i++)doc=addObject(doc,createStroke([{x:i,y:0},{x:i,y:20}]),'ballpoint');
  const original=structuredClone(doc.objects);doc=deleteObjects(doc,[doc.objects[1].id]);expect(doc.objects).toHaveLength(2);
  doc=undoDrawing(doc);expect(doc.objects).toEqual(original);expect(validateDrawing(doc)).toEqual([]);doc=redoDrawing(doc);expect(doc.objects).toHaveLength(2);expect(validateDrawing(doc)).toEqual([]);
  doc=undoDrawing(doc);doc=addObject(doc,createStroke([{x:9,y:9}]),'pencil');expect(redoDrawing(doc)).toEqual(doc);expect(replayDrawing(doc).objects).toEqual(doc.objects);
 });
 it('局部擦除是可保存回放的原子片段替换且保持荧光透明度',()=>{
  const stroke=createStroke([{x:0,y:0},{x:100,y:0}],'highlighter');let doc=addObject(createDrawing(),stroke,'highlighter');const previous=structuredClone(doc.objects);
  const fragments=[createStroke([{x:0,y:0},{x:40,y:0}],'highlighter',stroke.style),createStroke([{x:60,y:0},{x:100,y:0}],'highlighter',stroke.style)];
  doc=recordStep(doc,{operation:'erase',tool:'eraser',objects:fragments,removeIds:[stroke.id],parameters:{gesture:'draw'}});expect(validateDrawing(doc)).toEqual([]);expect(doc.objects).toHaveLength(2);expect(doc.objects.every(o=>o.style.opacity===.28)).toBe(true);
  const restored=JSON.parse(JSON.stringify(doc));expect(replayDrawing(restored).objects).toEqual(doc.objects);expect(undoDrawing(restored).objects).toEqual(previous);expect(redoDrawing(undoDrawing(restored)).objects).toEqual(doc.objects);expect(validateDrawing(redoDrawing(undoDrawing(restored)))).toEqual([]);
 });
 it('依赖删除级联并可撤销，初始图形始终不可编辑或擦除',()=>{
  let doc=createDrawing(),base=createObject('segment',[{x:0,y:0},{x:10,y:0}]);doc=addObject(doc,base,'segment');doc=addObject(doc,createObject('segment',[{x:10,y:0},{x:10,y:20}],{dependencies:[base.id]}),'segment');
  const original=structuredClone(doc.objects);const deleted=deleteObjects(doc,[base.id]);expect(deleted.objects).toEqual([]);expect(undoDrawing(deleted).objects).toEqual(original);expect(validateDrawing(deleted)).toEqual([]);
  const initial=lockInitialDrawing(doc);expect(()=>deleteObjects(createDrawing('free',initial),[base.id])).toThrow(/锁定/);expect(translateObject(initial.objects[0],99,99)).toEqual(initial.objects[0]);
 });
 it('回放工具移动与旋转插值，起点不瞬移到终点',()=>{
  let doc=setToolState(createDrawing(),{activeTool:'ruler',ruler:{origin:{x:0,y:0},angle:0}},'ruler');doc=setToolState(doc,{activeTool:'ruler',ruler:{origin:{x:100,y:80},angle:Math.PI/2}},'ruler',{gesture:'move'});
  expect(replayStepProgress(doc,1,0).toolState).toEqual(doc.steps[1].toolBefore);expect(replayStepProgress(doc,1,.5).toolState?.ruler).toMatchObject({origin:{x:50,y:40},angle:Math.PI/4});
 });
 it('旧圆弧上半圆、两点三角形及角度标注迁移保真',()=>{
  const legacy=(tool:string)=>({id:crypto.randomUUID(),tool,points:[{x:100,y:100},{x:140,y:100}],color:'#112233',width:2});
  const arc=migrateLegacy([legacy('arc')]).objects[0];expect(pointOnCircle(arc.center!,arc.radius!,arc.startAngle!+arc.sweep!*.5).y).toBeLessThan(arc.center!.y);expect(arc.sweep).toBe(Math.PI);
  const triangle=migrateLegacy([{...legacy('triangle'),points:[{x:100,y:50},{x:180,y:150}]}]).objects[0];expect(triangle.points).toEqual([{x:100,y:150},{x:140,y:50},{x:180,y:150}]);
  const angle=migrateLegacy([legacy('protractor')]).objects[0];expect(angle.points).toEqual([{x:170,y:100},{x:100,y:100},{x:140,y:100}]);expect(angle.showMeasurements).toBe(true);
  expect(validateDrawing([legacy('segment')])).toEqual([]);expect(validateDrawing([legacy('pen')],{mode:'strict'}).length).toBeGreaterThan(0);
 });
});

describe('可审核的合法严格尺规构造',()=>{
 it('圆圆交点加直尺形成垂直平分线，并非与唯一参考步骤比较',()=>{
  const fixture=perpendicularBisectorFixture();expect(validateInitialDrawing(fixture.initial)).toEqual([]);expect(validateDrawing(fixture.document,{mode:'strict',initial:fixture.initial})).toEqual([]);
  const [a,b]=fixture.line.points;expect(a.x).toBeCloseTo(400,12);expect(b.x).toBeCloseTo(400,12);expect(a.y).toBeCloseTo(100,12);expect(b.y).toBeCloseTo(400,12);
  expect(replayDrawing(fixture.document,undefined,fixture.initial).objects).toEqual(fixture.document.objects);
 });
 it('58.5°角用等半径转移、合法交点和直尺作角平分射线',()=>{
  const fixture=angleBisectorFixture();expect(validateDrawing(fixture.document,{mode:'strict',initial:fixture.initial})).toEqual([]);
  const [origin,end]=fixture.line.points;expect(angleBetween(fixture.given.points[0],origin,end)).toBeCloseTo(fixture.angle/2,10);expect(angleBetween(end,origin,fixture.given.points[2])).toBeCloseTo(fixture.angle/2,10);
 });
 it('圆规回放过程始终保持锁定圆心半径，最终状态完整复现',()=>{
  const fixture=perpendicularBisectorFixture(),index=fixture.document.steps.findIndex(s=>s.operation==='create'&&s.tool==='compass'),step=fixture.document.steps[index],object=step.after[0];
  for(const fraction of [.01,.25,.5,.9]){const replay=replayStepProgress(fixture.document,index,fraction,fixture.initial),partial=replay.objects.at(-1)!;expect(partial.center).toEqual(object.center);expect(partial.radius).toBe(object.radius);expect(replay.toolState?.compass?.radius).toBe(object.radius);expect(replay.toolState?.compass?.center).toEqual(object.center);}
  expect(replayStepProgress(fixture.document,index,1,fixture.initial).objects).toEqual(replayDrawing(fixture.document,index+1,fixture.initial).objects);
 });
});
