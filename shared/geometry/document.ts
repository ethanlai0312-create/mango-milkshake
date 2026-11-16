import type {ConstructionParameters,DrawingDocument,DrawingMode,GeometryObject,GeometryType,LegacyShape,Point,RecordStepInput,ToolState} from './types.ts';
import {clone,createObject,createQuickShape,geometryId} from './objects.ts';
import {angleOf,distance,TAU} from './math.ts';
import {anchorDependencies,radiusDependencies} from './snap.ts';
import {historyStacks,inversePatch,patchObjects,replayTimeline} from './timeline.ts';

const legacyTools=new Set(['pen','point','segment','line','ray','circle','arc','rectangle','triangle','polygon','text','angle','ruler','setSquare','protractor']);
export function migrateLegacy(value:LegacyShape[],mode:DrawingMode='free'):DrawingDocument {
 let doc=createDrawing(mode);
 const objects=value.filter(s=>s&&legacyTools.has(s.tool)&&Array.isArray(s.points)&&s.points.length).map(s=>{
  const a=s.points[0],b=s.points[1]??a,options={id:s.id,style:{color:s.color,width:s.width},text:s.text};
  if(s.tool==='pen')return createObject('stroke',s.points,{...options,pen:'ballpoint'});
  // Old tap-only shapes were accepted and often invisible. Preserve their location
  // as a point instead of producing a zero-radius object that blocks future saves.
  if(s.tool!=='text'&&s.tool!=='point'&&s.points.every(p=>distance(a,p)<1e-8))return createObject('point',[a],options);
  if(s.tool==='polygon'&&s.points.length<3)return createObject('segment',[a,b],options);
  if((s.tool==='rectangle'||s.tool==='triangle')&&(Math.abs(a.x-b.x)<1e-8||Math.abs(a.y-b.y)<1e-8))return createObject('segment',[a,b],options);
  if(s.tool==='rectangle'||s.tool==='triangle')return createQuickShape(s.tool,a,b,options);
  if(s.tool==='ruler'||s.tool==='setSquare')return createObject('segment',[a,b],options);
  if(s.tool==='protractor'||s.tool==='angle')return createObject('angle',[{x:a.x+70,y:a.y},a,b],{...options,showMeasurements:true});
  if(s.tool==='arc')return createObject('arc',[a,b],{...options,center:a,radius:distance(a,b),startAngle:Math.PI,sweep:Math.PI});
  return createObject(s.tool as GeometryType,s.tool==='point'?[a]:s.points,options);
 });
 if(objects.length)doc=recordStep(doc,{operation:'import',tool:'legacy',objects,description:'旧版结构化绘图迁移'});
 doc.legacy=true;return doc;
}
function initialObjects(value:unknown):GeometryObject[] {
 if(!value)return [];
 const objects=Array.isArray(value)?migrateLegacy(value as LegacyShape[]).objects:typeof value==='object'&&Array.isArray((value as DrawingDocument).objects)?(value as DrawingDocument).objects:[];
 return objects.map(object=>{
  const result=clone(object);result.locked=true;result.layer='initial';result.showMeasurements=false;delete result.createdByStep;return result;
 });
}
/** Authoring traces and tool measurements never become part of an answer's initial history. */
export function lockInitialDrawing(value:unknown):DrawingDocument {return {version:2,mode:'free',objects:initialObjects(value),steps:[]};}
export function createDrawing(mode:DrawingMode='free',initial?:unknown):DrawingDocument {return {version:2,mode,objects:initialObjects(initial),steps:[]};}
/** UI/load compatibility helper. Server validation must inspect the original input instead. */
export function normalizeDrawing(value:unknown,mode:DrawingMode='free',initial?:unknown):DrawingDocument {
 let doc:DrawingDocument;
 if(Array.isArray(value)&&!value.length)return createDrawing(mode,initial);
 if(Array.isArray(value))doc=migrateLegacy(value as LegacyShape[],mode);
 else if(value&&typeof value==='object'&&(value as DrawingDocument).version===2&&Array.isArray((value as DrawingDocument).objects)&&Array.isArray((value as DrawingDocument).steps))doc=clone(value as DrawingDocument);
 else return createDrawing(mode,initial);
 const known=initialObjects(initial),ids=new Set(known.map(o=>o.id));
 doc.mode=mode;if(known.length)doc.objects=[...known,...doc.objects.filter(o=>!ids.has(o.id))];return doc;
}
export function constructionDependencies(parameters:ConstructionParameters|undefined):string[]{
 return [...new Set([...(parameters?.anchors??[]).flatMap(anchorDependencies),...(parameters?.centerAnchor?anchorDependencies(parameters.centerAnchor):[]),...radiusDependencies(parameters?.radiusSource)])];
}
export function recordStep(document:DrawingDocument,input:RecordStepInput):DrawingDocument {
 // Historical steps and untouched objects are immutable values. Preserve their
 // references so adding one stroke doesn't copy/re-render every prior stroke.
 const doc:DrawingDocument={...document,objects:[...document.objects],steps:[...document.steps]},id=input.id??geometryId(),after=clone(input.objects??input.after??[]),removedIds=[...new Set(input.removeIds??[])];
 const objectIds=[...new Set([...after.map(o=>o.id),...removedIds])],before=doc.objects.filter(o=>objectIds.includes(o.id));
 if(before.some(o=>o.locked))throw new Error('初始或锁定对象不能修改、删除');
 if(input.operation==='create'&&after.some(o=>doc.objects.some(current=>current.id===o.id)))throw new Error('对象ID已存在');
 for(const object of after){
  if(input.operation==='create'||input.operation==='import'||input.operation==='erase'){
   object.createdByStep=id;
   if(doc.mode==='strict')object.dependencies=constructionDependencies(input.parameters);
  }
 }
 const toolAfter=input.toolState===undefined?clone(doc.toolState):clone(input.toolState);
 const nextObjects=patchObjects(doc.objects,after,removedIds);
 const step={version:1 as const,id,index:doc.steps.length,operation:input.operation,tool:input.tool,objectIds,before:clone(before),after,removedIds,toolBefore:clone(doc.toolState),toolAfter,parameters:clone(input.parameters),createdAt:input.createdAt??Date.now(),description:input.description,context:clone(input.context),objectOrderBefore:doc.objects.map(o=>o.id),objectOrderAfter:nextObjects.map(o=>o.id)};
 doc.steps.push(step);doc.objects=nextObjects;doc.toolState=toolAfter;return doc;
}
export function addObject(document:DrawingDocument,object:GeometryObject,tool:string,parameters?:ConstructionParameters,toolState?:ToolState){return recordStep(document,{operation:'create',tool,objects:[object],parameters,toolState});}
export function updateObjects(document:DrawingDocument,objects:GeometryObject[],tool='select'){return recordStep(document,{operation:'update',tool,objects});}
export function dependentIds(document:DrawingDocument,ids:string[]){
 const result=new Set(ids);let changed=true;
 while(changed){changed=false;for(const object of document.objects)if(!result.has(object.id)&&object.dependencies.some(id=>result.has(id))){result.add(object.id);changed=true;}}
 return [...result];
}
export function deleteObjects(document:DrawingDocument,ids:string[],tool='eraser'){
 const removeIds=dependentIds(document,ids).filter(id=>document.objects.some(o=>o.id===id));
 if(!removeIds.length)return clone(document);return recordStep(document,{operation:'delete',tool,removeIds});
}
export function setToolState(document:DrawingDocument,state:ToolState,tool=state.activeTool??'select',parameters?:ConstructionParameters){return recordStep(document,{operation:'tool',tool,toolState:state,parameters});}
function seedForReplay(document:DrawingDocument,initial?:unknown){return initial===undefined?document.objects.filter(o=>o.layer==='initial').map(o=>clone(o)):initialObjects(initial);}
export function replayDrawing(document:DrawingDocument,count=document.steps.length,initial?:unknown):DrawingDocument {
 const end=Math.max(0,Math.min(Math.floor(count),document.steps.length)),state=replayTimeline(document.steps,seedForReplay(document,initial),end);
 return {version:2,mode:document.mode,objects:state.objects,steps:clone(document.steps.slice(0,end)),toolState:state.toolState,...(document.legacy?{legacy:true}:{})};
}
export function undoDrawing(document:DrawingDocument):DrawingDocument {
 const target=historyStacks(document.steps).undo.at(-1);if(!target)return clone(document);
 const inverse=inversePatch(target),next=recordStep(document,{operation:'undo',tool:'undo',objects:inverse.after,removeIds:inverse.removeIds,parameters:{targetStepId:target.id},toolState:target.toolBefore??{}});
 const step=next.steps.at(-1)!;step.toolAfter=clone(target.toolBefore);next.toolState=clone(target.toolBefore);
 if(target.objectOrderBefore){step.objectOrderAfter=[...target.objectOrderBefore];const byId=new Map(next.objects.map(o=>[o.id,o]));next.objects=step.objectOrderAfter.map(id=>byId.get(id)!);}
 return next;
}
export function redoDrawing(document:DrawingDocument):DrawingDocument {
 const target=historyStacks(document.steps).redo.at(-1);if(!target)return clone(document);
 const next=recordStep(document,{operation:'redo',tool:'redo',objects:target.after,removeIds:target.removedIds,parameters:{targetStepId:target.id},toolState:target.toolAfter??{}}),step=next.steps.at(-1)!;
 step.toolAfter=clone(target.toolAfter);next.toolState=clone(target.toolAfter);
 if(target.objectOrderAfter){step.objectOrderAfter=[...target.objectOrderAfter];const byId=new Map(next.objects.map(o=>[o.id,o]));next.objects=step.objectOrderAfter.map(id=>byId.get(id)!);}
 return next;
}
/** Interpolate a recorded compass sweep, without rounding or changing its fixed radius. */
export function replayStepProgress(document:DrawingDocument,index:number,progress:number,initial?:unknown):DrawingDocument {
 const result=replayDrawing(document,index,initial),step=document.steps[index];if(!step)return result;
 const fraction=Math.max(0,Math.min(1,progress));
 if(fraction===1)return replayDrawing(document,index+1,initial);
 if(step.operation==='create')for(const object of step.after){
  if(object.type==='arc'||object.type==='circle'){
   const partial=clone(object),start=object.startAngle??step.parameters?.startAngle??0,sweep=object.type==='circle'?(step.parameters?.sweep??TAU):(object.sweep??0);
   partial.type='arc';partial.startAngle=start;partial.sweep=sweep*fraction;result.objects.push(partial);
   if(step.toolAfter?.compass)result.toolState={...clone(step.toolAfter),compass:{...clone(step.toolAfter.compass),angle:start+sweep*fraction,phase:'drawing',startAngle:start,sweep:sweep*fraction}};
  }else if(object.type==='stroke'||object.type==='highlight'){
   const partial=clone(object);partial.points=partial.points.slice(0,Math.max(1,Math.ceil(partial.points.length*fraction)));result.objects.push(partial);
   const position=partial.points.at(-1);if(position)result.toolState={...clone(step.toolAfter),pen:{position,angle:step.toolAfter?.pen?.angle??-Math.PI/3,kind:partial.pen}};
  }else if(fraction>.5)result.objects.push(clone(object));
 }
 else if(step.operation==='tool'&&step.toolBefore&&step.toolAfter){
  if(fraction===0){result.toolState=clone(step.toolBefore);return result;}
  result.toolState=clone(step.toolAfter);
  const before=step.toolBefore.compass,after=step.toolAfter.compass;
  if(before&&after)result.toolState.compass={...after,center:{x:before.center.x+(after.center.x-before.center.x)*fraction,y:before.center.y+(after.center.y-before.center.y)*fraction},radius:before.radius+(after.radius-before.radius)*fraction,angle:before.angle+(after.angle-before.angle)*fraction};
  for(const key of ['ruler','setSquare','setSquare45','setSquare30','protractor'] as const){const a=step.toolBefore[key],b=step.toolAfter[key];if(a&&b)result.toolState[key]={...b,origin:{x:a.origin.x+(b.origin.x-a.origin.x)*fraction,y:a.origin.y+(b.origin.y-a.origin.y)*fraction},angle:a.angle+(b.angle-a.angle)*fraction};}
 }
 return result;
}
export function canUndo(document:DrawingDocument){return historyStacks(document.steps).undo.length>0;}
export function canRedo(document:DrawingDocument){return historyStacks(document.steps).redo.length>0;}
