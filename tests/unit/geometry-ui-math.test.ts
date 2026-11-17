import {describe,it,expect} from 'vitest';
import {addObject,createDrawing,createObject,createStroke,migrateLegacy,validateDrawing,toolAllowed} from '../../shared/geometry';
import {fitObjectViewport,restoredTool,sameDrawingContent} from '../../src/components/geometry/editor-types';
import {interiorAngles,vertexLabelPositions} from '../../src/components/geometry/annotations';
import {eraseStroke} from '../../src/components/geometry/erase';

describe('几何显示和旧数据边界',()=>{
 it('自动适应大圆只改变视口，完整边界进入可见区域且数学尺寸不变',()=>{
  const objects=[createObject('circle',[{x:200,y:250},{x:450,y:250}],{radius:250}),createObject('circle',[{x:600,y:250},{x:850,y:250}],{radius:250})],snapshot=JSON.stringify(objects),v=fitObjectViewport(objects);
  expect(v.zoom).toBeLessThan(1);for(const p of [{x:-50,y:0},{x:850,y:500}]){expect(p.x*v.zoom+v.x).toBeGreaterThanOrEqual(19.99);expect(p.x*v.zoom+v.x).toBeLessThanOrEqual(780.01);expect(p.y*v.zoom+v.y).toBeGreaterThanOrEqual(19.99);expect(p.y*v.zoom+v.y).toBeLessThanOrEqual(480.01);}expect(JSON.stringify(objects)).toBe(snapshot);
 });
 it('刷新和只读结果恢复实际工具，但不会恢复题目模式外的工具',()=>{
  expect(restoredTool({activeTool:'compass'},'strict')).toBe('compass');expect(restoredTool({activeTool:'fountain'},'free')).toBe('fountain');expect(restoredTool({activeTool:'fountain'},'strict')).toBe('ruler');expect(restoredTool({activeTool:'unknown-plugin'},'free')).toBe('ballpoint');
 });
 it('服务器归属元数据回写不应打断正在进行的画布操作，几何改变仍被识别',()=>{
  const local=addObject(createDrawing(),createStroke([{x:0,y:0},{x:10,y:10}]),'ballpoint'),server=structuredClone(local);server.steps[0].context={questionId:'question-one',role:'author'};expect(sameDrawingContent(local,server)).toBe(true);server.objects[0].points[1].x=12;expect(sameDrawingContent(local,server)).toBe(false);
 });
 it('凹多边形两种点序均显示270度凹角，内角和正确',()=>{
  const points=[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:1,y:1},{x:0,y:2}];
  for(const list of [points,[...points].reverse()]){const angles=interiorAngles(list);expect(Math.max(...angles)).toBeCloseTo(270*Math.PI/180);expect(angles.reduce((a,b)=>a+b)).toBeCloseTo(3*Math.PI);}
 });
 it('相邻顶点标签选择不同的避让位置',()=>{
  const points=[{x:0,y:0},{x:2,y:0},{x:1,y:2}],positions=vertexLabelPositions(points,['A','B','C']);
  expect(new Set(positions.map(p=>JSON.stringify(p))).size).toBe(3);expect(positions.every(p=>p&&Number.isFinite(p.x+p.y))).toBe(true);
 });
 it('旧版单击产生的零尺寸圆、圆弧、线段恢复后仍可通过保存验证',()=>{
  for(const tool of ['circle','arc','segment','rectangle','triangle','polygon']){
   const doc=migrateLegacy([{id:'old-tap',tool,points:[{x:5,y:5},{x:5,y:5}],color:'#112233',width:2}]);
   expect(doc.objects[0].type).toBe('point');expect(validateDrawing(doc)).toEqual([]);
  }
 });
 it('严格模式工具白名单拒绝独立橡皮、测量和书写工具',()=>{
  for(const tool of ['ballpoint','highlighter','pencil','fountain','eraser','protractor','setSquare','midpoint','angleBisector'])expect(toolAllowed(tool,'strict')).toBe(false);
  for(const tool of ['ruler','compass','select','undo','redo'])expect(toolAllowed(tool,'strict')).toBe(true);
 });
 it('圆形局部擦除保留两侧矢量路径、压力与透明度，锁定图形不受影响',()=>{
  const stroke=createStroke([{x:0,y:0,pressure:.2},{x:100,y:0,pressure:.8}],'highlighter',{opacity:.28});
  const pieces=eraseStroke(stroke,{x:50,y:0},10);expect(pieces).toHaveLength(2);expect(pieces[0].points.at(-1)?.x).toBeCloseTo(40);expect(pieces[1].points[0].x).toBeCloseTo(60);
  expect(pieces.every(p=>p.style.opacity===.28)).toBe(true);expect(pieces[0].points.at(-1)?.pressure).toBeCloseTo(.44);
  expect(eraseStroke({...stroke,locked:true},{x:50,y:0},100)).toEqual([{...stroke,locked:true}]);
 });
});
