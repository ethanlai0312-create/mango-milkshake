import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addObject,createDrawing,createObject,pointOnCircle,redoDrawing,replayDrawing,replayStepProgress,setToolState,undoDrawing,validateDrawing,type ToolState} from '../../shared/geometry';
import {Instruments} from '../../src/components/geometry/Instruments';
import {instrumentBounds,instrumentState,placedInstruments,selectInstrument,orientCompass,withInstrumentPose} from '../../src/components/geometry/instrument-state';
import {fitObjectViewport} from '../../src/components/geometry/editor-types';

function strictState():ToolState{return {activeTool:'compass',visibleInstruments:['ruler','compass'],ruler:{origin:{x:100,y:250},angle:0,length:300},compass:{center:{x:300,y:250},radius:100,angle:0,phase:'position',penDown:false,centerAnchor:{kind:'free',point:{x:300,y:250}},radiusSource:{kind:'opening'}}};}
function arcDocument(penDown=true){
 const state=strictState();state.compass!.penDown=penDown;
 let doc=setToolState(createDrawing('strict'),state,'compass',{gesture:'select'});
 const ready={...state,compass:{...state.compass!,phase:'ready' as const}};doc=setToolState(doc,ready,'compass',{gesture:'lock'});
 const c=ready.compass,start=c.angle,sweep=Math.PI/2;
 const arc=createObject('arc',[c.center,pointOnCircle(c.center,c.radius,start)],{center:c.center,radius:c.radius,startAngle:start,sweep});
 return addObject(doc,arc,'compass',{centerAnchor:c.centerAnchor,radiusSource:c.radiusSource,startAngle:start,sweep,motion:[0,.5,1].map(t=>pointOnCircle(c.center,c.radius,start+sweep*t))},{...ready,compass:{...c,angle:start+sweep}});
}
describe('抬笔圆规、多个实体工具与兼容保存',()=>{
 it('新增圆规默认抬笔，旧的绘制中回放仍显示落笔状态',()=>{
  expect(instrumentState(undefined,'free').compass?.penDown).toBe(false);
  expect(instrumentState({compass:{...strictState().compass!,phase:'drawing',penDown:undefined}},'free').compass?.penDown).toBe(true);
 });
 it('放置五种工具后选择书写笔仍保留全部工具，重选工具只改变最上层顺序',()=>{
  let state=instrumentState(undefined,'free');for(const tool of ['ruler','compass','setSquare45','setSquare30','protractor'] as const)state=selectInstrument(state,tool,'free');
  state=selectInstrument(state,'ballpoint','free');expect(placedInstruments(state,'free')).toHaveLength(5);
  state=selectInstrument(state,'compass','free');expect(state.visibleInstruments?.at(-1)).toBe('compass');expect(new Set(state.visibleInstruments).size).toBe(5);
 });
 it.each(['45','30'] as const)('旧%s度三角尺可继续保存，不把旧variant字段写入独立姿态',variant=>{
  const old:ToolState={activeTool:'setSquare',setSquare:{origin:{x:20,y:40},angle:.4,length:200,variant}};
  const state=instrumentState(old,'free');expect(state[variant==='30'?'setSquare30':'setSquare45']?.origin).toEqual({x:20,y:40});
  expect(validateDrawing(setToolState(createDrawing(),state,'select'))).toEqual([]);
 });
 it('两把三角尺的位置独立，移动45度尺不改变30度尺',()=>{
  const before=instrumentState(undefined,'free'),other=structuredClone(before.setSquare30);
  const next=withInstrumentPose(before,'setSquare45',{origin:{x:12,y:18},angle:.5,length:220});
  expect(next.setSquare30).toEqual(other);expect(next.setSquare45?.origin).toEqual({x:12,y:18});
 });
 it('适应视图包含旋转工具与大开口尖端，但不修改数学姿态',()=>{
  let state=selectInstrument(instrumentState(undefined,'free'),'compass','free');state={...state,compass:{...state.compass!,radius:350,angle:Math.PI/2}};
  const original=JSON.stringify(state),points=instrumentBounds(state,'free'),view=fitObjectViewport([],points);
  for(const p of points){expect(p.x*view.zoom+view.x).toBeGreaterThanOrEqual(19.99);expect(p.x*view.zoom+view.x).toBeLessThanOrEqual(780.01);expect(p.y*view.zoom+view.y).toBeGreaterThanOrEqual(19.99);expect(p.y*view.zoom+view.y).toBeLessThanOrEqual(480.01);}expect(JSON.stringify(state)).toBe(original);
 });
 it('严格模式抬笔旋转保存为工具步骤，零新增几何对象，圆心半径保持不变',()=>{
  const before=strictState(),after={...before,compass:orientCompass(before.compass!,Math.PI/2)};
  let doc=setToolState(createDrawing('strict'),before,'compass',{gesture:'select'});doc=setToolState(doc,after,'compass',{gesture:'rotate'});
  expect(validateDrawing(doc)).toEqual([]);expect(doc.objects).toEqual([]);expect(after.compass.center).toEqual(before.compass?.center);expect(after.compass.radius).toBe(100);
  const half=replayStepProgress(doc,1,.5);expect(half.objects).toEqual([]);expect(half.toolState?.compass?.angle).toBeCloseTo(Math.PI/4);expect(half.toolState?.compass?.penDown).toBe(false);
 });
 it('只有落笔并锁定后才允许严格圆规产生圆弧',()=>{
  expect(validateDrawing(arcDocument(true))).toEqual([]);expect(validateDrawing(arcDocument(false)).some(e=>e.includes('抬笔'))).toBe(true);
 });
 it('多工具的姿态、可见性、抬笔状态可序列化、回放和撤销重做',()=>{
  const first=strictState(),second={...first,visibleInstruments:['compass'] as const,compass:orientCompass(first.compass!,.75)};
  let doc=setToolState(createDrawing('strict'),first,'compass',{gesture:'select'});doc=setToolState(doc,{...second,visibleInstruments:[...second.visibleInstruments]},'compass',{gesture:'rotate'});
  const stored=JSON.parse(JSON.stringify(doc));expect(validateDrawing(stored)).toEqual([]);expect(replayDrawing(stored).toolState).toEqual(doc.toolState);
  const undone=undoDrawing(stored);expect(undone.toolState).toEqual(first);expect(redoDrawing(undone).toolState).toEqual(doc.toolState);
 });
 it('服务器拒绝非法工具驻留、重复工具和伪造落笔字段',()=>{
  for(const state of [{...strictState(),visibleInstruments:['compass','protractor']},{...strictState(),visibleInstruments:['compass','compass']},{...strictState(),compass:{...strictState().compass!,penDown:'yes'}}]){
   expect(validateDrawing(setToolState(createDrawing('strict'),state as ToolState,'compass',{gesture:'select'})).length).toBeGreaterThan(0);
  }
 });
 it('渲染五个驻留工具、两个真实尖端，且不再输出覆盖尖端的控制圆盘',()=>{
  let state=instrumentState(undefined,'free');for(const tool of ['ruler','compass','setSquare45','setSquare30','protractor'] as const)state=selectInstrument(state,tool,'free');
  const html=renderToStaticMarkup(createElement('svg',null,createElement(Instruments,{state,tool:'ballpoint',strict:false,penPosition:null,color:'#26364b',zoom:1})));
  expect(html.match(/data-instrument=/g)).toHaveLength(5);expect(html).toContain('data-compass-tip="needle"');expect(html).toContain('data-compass-tip="pencil"');expect(html).not.toContain('geo-handle-disc');
 });
 it('只读参考不暴露无效的工具按钮焦点',()=>{
  const html=renderToStaticMarkup(createElement('svg',null,createElement(Instruments,{state:strictState(),tool:'compass',strict:true,penPosition:null,color:'#26364b',zoom:1,readOnly:true})));
  expect(html).not.toContain('role="button"');expect(html).not.toContain('tabindex="0"');
 });
});
