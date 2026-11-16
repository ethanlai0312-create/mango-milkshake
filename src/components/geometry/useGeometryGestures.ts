import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type RefObject} from 'react';
import {createObject,createQuickShape,moveVertex,recordStep,snapPoint,translateObject,unwrapAngle,type GeometryObject,type InstrumentKind,type Point,type PointAnchor,type SnapResult,type ToolState} from '../../../shared/geometry';
import {promptText} from '../../lib/dialogs';
import {COMPASS_MAX_RADIUS,add,atAngle,clamp,distance,instrumentEdges,isInstrument,isPen,projectToLine,rotate,subtract,type EditorTool,type Viewport} from './editor-types';
import {instrumentPose,orientCompass,withInstrumentPose} from './instrument-state';
import {eraseStroke,touchesStroke} from './erase';
import type {GeometryEditor} from './useGeometryEditor';

type Action={kind:string;tool:EditorTool;instrument?:InstrumentKind;pointerId:number;start:Point;last:Point;view:Viewport;state:ToolState;nextState?:ToolState;object?:GeometryObject;objects?:GeometryObject[];draft?:GeometryObject;edge?:[Point,Point];anchor?:PointAnchor;endAnchor?:PointAnchor;handle?:string;lastAngle?:number;sweep?:number;motion:Point[];vertex?:number};
export function useGeometryGestures(editor:GeometryEditor,svg:RefObject<SVGSVGElement|null>){
 const e=useRef(editor);e.current=editor;
 const action=useRef<Action|null>(null),pointers=useRef(new Map<number,{point:Point;type:string}>()),pinch=useRef<{distance:number;center:Point;view:Viewport}|null>(null),suppress=useRef(false),space=useRef(false);
 const [cursor,setCursor]=useState<Point|null>(null),[activeSnap,setSnap]=useState<SnapResult|null>(null),[pending,setPending]=useState<{point:Point;anchor?:PointAnchor}[]>([]),[transfer,setTransfer]=useState(false);
 const pendingRef=useRef(pending),transferRef=useRef(transfer),snapRef=useRef<SnapResult|null>(null),frame=useRef(0),visual=useRef<{cursor?:Point;snap?:SnapResult|null;draft?:GeometryObject[];state?:ToolState}>({});
 pendingRef.current=pending;transferRef.current=transfer;
 const flush=()=>{frame.current=0;const v=visual.current;visual.current={};if(v.cursor)setCursor(v.cursor);if('snap'in v){setSnap(v.snap??null);snapRef.current=v.snap??null;}if(v.draft)e.current.setDraft(v.draft);if(v.state)e.current.updateTool(v.state);};
 const schedule=(next:typeof visual.current)=>{visual.current={...visual.current,...next};if(!frame.current)frame.current=requestAnimationFrame(flush);};
 const clearVisual=()=>{cancelAnimationFrame(frame.current);frame.current=0;visual.current={};};
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 useEffect(()=>{clearVisual();action.current=null;setPending([]);pendingRef.current=[];setTransfer(false);},[editor.mode,editor.readOnly,editor.replayCount]);
 useEffect(()=>{if(action.current?.instrument!==editor.tool){clearVisual();action.current=null;}setPending([]);pendingRef.current=[];setTransfer(false);},[editor.tool]);
 function screenPoint(event:{clientX:number;clientY:number}):Point{const element=svg.current,matrix=element?.getScreenCTM();if(!element||!matrix)return{x:0,y:0};const p=element.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const transformed=p.matrixTransform(matrix.inverse());return{x:transformed.x,y:transformed.y};}
 function world(event:{clientX:number;clientY:number;pressure?:number;pointerType?:string;tiltX?:number;tiltY?:number;timeStamp?:number}):Point{const p=screenPoint(event),v=e.current.view;return{x:(p.x-v.x)/v.zoom,y:(p.y-v.y)/v.zoom,pressure:event.pointerType==='pen'?(event.pressure??.5):.5,tiltX:event.tiltX??0,tiltY:event.tiltY??0,time:event.timeStamp};}
 function screenScale(){const m=svg.current?.getScreenCTM();return e.current.view.zoom*(m?Math.hypot(m.a,m.b):1);}
 function snapped(p:Point,pointerType:string,origin?:Point,legalOnly=false){const ed=e.current;if(!ed.snap&&!legalOnly)return null;return snapPoint(p,ed.latest.current.objects,{mode:legalOnly?'strict':ed.mode,zoom:screenScale(),threshold:pointerType==='touch'?20:12,pointerType,grid:ed.mode==='free'&&ed.grid?10:undefined,angles:ed.mode==='free'?Array.from({length:24},(_,i)=>i*Math.PI/12):undefined,origin,previous:snapRef.current});}
 function capture(event:ReactPointerEvent<SVGSVGElement>){try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* A cancelled pointer has no capture target. */}}
 function finishPolygon(){const ed=e.current,points=pendingRef.current.map(p=>p.point);if(points.length>=3){ed.commitObject(ed.makeObject('polygon',points),'polygon');setPending([]);pendingRef.current=[];}}
 function cancel(){const ed=e.current;clearVisual();if(action.current)ed.updateTool(action.current.state);action.current=null;ed.setDraft([]);setPending([]);pendingRef.current=[];setSnap(null);}
 function handleTransfer(point:Point,result:SnapResult|null){
  const ed=e.current;if(!result?.anchor||result.anchor.kind==='free'){ed.setMessage('选择已有线段，或依次选择两个已有点 / 交点来取开口');return;}
  const previous=pendingRef.current[0];if(!previous){setPending([{point:result.point,anchor:result.anchor}]);pendingRef.current=[{point:result.point,anchor:result.anchor}];ed.setMessage('再选择一个已有点；开口会转移到圆规');return;}
  const radius=distance(previous.point,point);if(radius<.01)return;if(radius>COMPASS_MAX_RADIUS){ed.setMessage('所取长度超出这把圆规的固定支腿开口范围');return;}
  ed.updateTool({...ed.toolState,compass:{...ed.toolState.compass!,radius,phase:'opening',radiusSource:{kind:'points',anchors:[previous.anchor!,result.anchor]}}},true,{gesture:'opening',radiusSource:{kind:'points',anchors:[previous.anchor!,result.anchor]}});setTransfer(false);setPending([]);pendingRef.current=[];
 }
 async function down(event:ReactPointerEvent<SVGSVGElement>){
  const ed=e.current;if(event.button!==0&&event.button!==1)return;
  const screen=screenPoint(event),p=world(event);pointers.current.set(event.pointerId,{point:screen,type:event.pointerType});capture(event);
  const touches=[...pointers.current.values()].filter(p=>p.type==='touch');
  if(touches.length===2){clearVisual();if(action.current)ed.updateTool(action.current.state);action.current=null;ed.setDraft([]);setPending([]);pendingRef.current=[];suppress.current=true;pinch.current={distance:distance(touches[0].point,touches[1].point),center:{x:(touches[0].point.x+touches[1].point.x)/2,y:(touches[0].point.y+touches[1].point.y)/2},view:{...ed.view}};event.preventDefault();return;}
  if(suppress.current)return;
  if(action.current)return;
  const base:Action={kind:'',tool:ed.tool,pointerId:event.pointerId,start:p,last:p,view:{...ed.view},state:structuredClone(ed.toolState),motion:[p]};
  if(ed.tool==='pan'||space.current||event.button===1||!ed.canEdit){action.current={...base,kind:'pan',start:screen,last:screen};return;}
  const target=event.target as Element,shapeId=target.closest('[data-shape]')?.getAttribute('data-shape'),object=ed.latest.current.objects.find(o=>o.id===shapeId),handle=target.closest('[data-geo-handle]')?.getAttribute('data-geo-handle'),edgeIndex=target.closest('[data-geo-edge]')?.getAttribute('data-geo-edge');
  const snap=snapped(p,event.pointerType,undefined,ed.mode==='strict'||transferRef.current),q=snap?.point??p;schedule({cursor:p,snap});
  if(ed.tool==='compass'&&transferRef.current){
   if(object?.type==='segment'){const radius=distance(object.points[0],object.points[1]);if(radius>COMPASS_MAX_RADIUS){ed.setMessage('所取长度超出这把圆规的固定支腿开口范围');return;}ed.updateTool({...ed.toolState,compass:{...ed.toolState.compass!,radius,phase:'opening',radiusSource:{kind:'segment',objectId:object.id}}},true,{gesture:'opening',radiusSource:{kind:'segment',objectId:object.id}});setTransfer(false);setPending([]);return;}
   handleTransfer(q,snap);return;
  }
  let tool=ed.tool,state=ed.toolState;const hit=target.closest('[data-instrument]')?.getAttribute('data-instrument');
  const instrument=hit&&isInstrument(hit)&&(ed.mode==='free'||['ruler','compass'].includes(hit))?hit as InstrumentKind:undefined;
  // A pen can share a placed ruler without replacing it or moving its pose.
  if(instrument&&edgeIndex!==undefined&&!handle&&isPen(tool)&&['ruler','setSquare45','setSquare30'].includes(instrument)){
   const edge=instrumentEdges(instrument,state)[Number(edgeIndex)],start={...p,...projectToLine(p,...edge)};
   action.current={...base,kind:'stroke',edge,start,draft:ed.makeObject(tool==='highlighter'?'highlight':'stroke',[start],{pen:tool})};ed.setDraft([action.current.draft!]);return;
  }
  if(instrument&&(handle||edgeIndex!==undefined)){
   // Moving a parked instrument must not change the properties panel and shift the canvas mid-drag.
   tool=instrument;
   base.tool=tool;base.instrument=instrument;base.state=structuredClone(state);
  }
  if(handle){
   if(handle==='compass-rotate'){const c=state.compass!,lastAngle=Math.atan2(p.y-c.center.y,p.x-c.center.x);
    if(!c.penDown){action.current={...base,kind:'tool',handle,lastAngle,sweep:0};return;}
    action.current={...base,kind:'compass-draw',motion:[atAngle(c.center,c.radius,c.angle)],lastAngle,sweep:0};ed.updateTool({...state,compass:{...c,phase:'ready',startAngle:c.angle,sweep:0}},true,{gesture:'lock',centerAnchor:c.centerAnchor??{kind:'free',point:c.center},radiusSource:c.radiusSource??{kind:'opening'}},'compass');ed.updateTool({...state,compass:{...c,phase:'drawing',startAngle:c.angle,sweep:0}});return;}
   action.current={...base,kind:'tool',handle};return;
  }
  if(tool==='select'){
   if(!object){ed.setSelectedIds([]);return;}if(object.locked){ed.setSelectedIds([]);ed.setMessage('题目给定图形已锁定');return;}
   ed.setSelectedIds(event.shiftKey?[...new Set([...ed.selectedIds,object.id])]:[object.id]);
   if(ed.mode==='free'){const vertex=target.closest('[data-geo-vertex]')?.getAttribute('data-geo-vertex');action.current={...base,kind:'object',object,vertex:vertex!==undefined&&vertex!==null?Number(vertex):undefined};}return;
  }
  if(tool==='eraser'){
   action.current={...base,kind:'erase',objects:structuredClone(ed.latest.current.objects)};if(ed.eraserMode==='object'){if(object&&!object.locked)action.current.objects=action.current.objects!.filter(o=>o.id!==object.id);}else eraseAt(action.current,p);ed.setDraft(action.current.objects!);return;
  }
  if(tool==='compass'){const c=state.compass!,centerAnchor=snap?.anchor??{kind:'free' as const,point:q};ed.updateTool({...state,compass:{...c,center:q,centerAnchor,phase:'position'}},true,{gesture:'move',centerAnchor},'compass');return;}
  if(tool==='text'){const text=await promptText('输入标注文字');if(text)ed.commitObject(ed.makeObject('text',[q],{text}),'text');return;}
  if(tool==='polygon'||tool==='angle'){
   const points=[...pendingRef.current,{point:q,anchor:snap?.anchor}];setPending(points);pendingRef.current=points;
   if(tool==='angle'&&points.length===3){ed.commitObject(ed.makeObject('angle',points.map(p=>p.point),{showMeasurements:true}),'angle');setPending([]);pendingRef.current=[];}else ed.setDraft([ed.makeObject(tool==='angle'?'angle':'polygon',points.map(p=>p.point))]);return;
  }
  if(tool==='ruler'&&ed.mode==='strict'){
   if(!snap?.anchor||snap.anchor.kind==='free'){ed.setMessage('严格尺规：先选择已有点或合法交点，再连接第二个点');return;}
   const previous=pendingRef.current[0],start=previous?.point??q,anchor=previous?.anchor??snap.anchor;
   const pose={...state.ruler!,origin:start,angle:Math.atan2(q.y-start.y,q.x-start.x)};ed.updateTool({...state,ruler:pose});
   action.current={...base,kind:'ruler',start,anchor,endAnchor:previous?snap.anchor:undefined,draft:ed.makeObject(ed.rulerType,[start,q])};ed.setDraft([action.current.draft!]);return;
  }
  if(['ruler','setSquare45','setSquare30'].includes(tool)){
   const edges=instrumentEdges(tool,state);let edge=edges[Number(edgeIndex??0)];if(edgeIndex===undefined)edge=edges.reduce((best,current)=>distance(p,projectToLine(p,...current))<distance(p,projectToLine(p,...best))?current:best,edges[0]);
   const start=projectToLine(q,...edge);action.current={...base,kind:'ruler',start,edge,draft:ed.makeObject(ed.rulerType,[start,start])};return;
  }
  if(tool==='protractor'){const pose=state.protractor!,center=pose.origin;action.current={...base,kind:'protractor',draft:ed.makeObject('angle',[atAngle(center,100,pose.angle),center,q],{showMeasurements:true})};ed.setDraft([action.current.draft!]);return;}
  if(isPen(tool)){action.current={...base,kind:'stroke',draft:ed.makeObject(tool==='highlighter'?'highlight':'stroke',[p],{pen:tool})};ed.setDraft([action.current.draft!]);return;}
  const draft=createQuickShape(tool as Parameters<typeof createQuickShape>[0],q,q,{style:{...ed.style},showMeasurements:tool==='length'||ed.showMeasurements});action.current={...base,kind:'shape',start:q,draft};ed.setDraft([draft]);
 }
 function eraseAt(current:Action,p:Point){
  const ed=e.current,radius=12/screenScale(),steps=Math.max(1,Math.ceil(distance(current.last,p)/(radius*.5)));let objects=current.objects!;
  for(let j=1;j<=Math.min(steps,200);j++){const q={x:current.last.x+(p.x-current.last.x)*j/steps,y:current.last.y+(p.y-current.last.y)*j/steps};objects=objects.flatMap(o=>ed.eraserMode==='partial'?eraseStroke(o,q,radius):!o.locked&&['stroke','highlight'].includes(o.type)&&touchesStroke(o,q,radius)?[]:[o]);}current.objects=objects;
 }
 function move(event:ReactPointerEvent<SVGSVGElement>){
  const ed=e.current,p=world(event),screen=screenPoint(event);const stored=pointers.current.get(event.pointerId);if(stored)pointers.current.set(event.pointerId,{...stored,point:screen});
  if(pinch.current){const touches=[...pointers.current.values()].filter(p=>p.type==='touch');if(touches.length>=2){const a=touches[0].point,b=touches[1].point,center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},initial=pinch.current,zoom=clamp(initial.view.zoom*distance(a,b)/(initial.distance||1),Math.min(.25,initial.view.zoom),6);ed.setView({zoom,x:center.x-(initial.center.x-initial.view.x)*zoom/initial.view.zoom,y:center.y-(initial.center.y-initial.view.y)*zoom/initial.view.zoom});}return;}
  if(suppress.current)return;
  const current=action.current;if(!current||current.pointerId!==event.pointerId){schedule({cursor:p,snap:ed.canEdit&&!isPen(ed.tool)?snapped(p,event.pointerType):null});return;}
  current.motion.push(p);if(current.motion.length>800)current.motion.splice(1,1);
  if(current.kind==='pan'){ed.setView({...current.view,x:current.view.x+screen.x-current.start.x,y:current.view.y+screen.y-current.start.y});return;}
  if(!ed.canEdit)return;
   const result=isPen(current.tool)?null:snapped(p,event.pointerType,current.start,ed.mode==='strict'),q=result?.point??p;schedule({cursor:p,snap:result});
  if(current.kind==='tool'){
    let state=structuredClone(current.state);const handle=current.handle!,delta=subtract(p,current.start);
   if(handle.startsWith('compass')){const c=state.compass!;
     if(handle==='compass-rotate'){const angle=Math.atan2(p.y-c.center.y,p.x-c.center.x),previous=current.lastAngle!;current.sweep=(current.sweep??0)+unwrapAngle(previous,angle)-previous;current.lastAngle=angle;state.compass=orientCompass(c,current.sweep);}
     else if(handle==='compass-opening'){const local=rotate(subtract(p,c.center),-c.angle);c.radius=clamp(local.x/.77,12,COMPASS_MAX_RADIUS);c.phase='opening';c.radiusSource={kind:'opening'};}
    else{c.center=handle==='compass-center'?q:add(c.center,delta);c.centerAnchor=handle==='compass-center'?(result?.anchor??{kind:'free',point:q}):{kind:'free',point:c.center};c.phase='position';}
    }else{const pose=instrumentPose(state,current.tool);if(!pose)return;if(handle==='instrument-rotate'){const angle=Math.atan2(p.y-pose.origin.y,p.x-pose.origin.x),previous=current.lastAngle??Math.atan2(current.start.y-pose.origin.y,current.start.x-pose.origin.x);current.sweep=(current.sweep??0)+unwrapAngle(previous,angle)-previous;current.lastAngle=angle;pose.angle+=current.sweep;}else pose.origin=add(pose.origin,delta);state=withInstrumentPose(state,current.tool,pose);}
   current.last=p;current.nextState=state;schedule({state});return;
  }
  if(current.kind==='compass-draw'){
   const c=current.state.compass!,angle=Math.atan2(p.y-c.center.y,p.x-c.center.x),delta=unwrapAngle(current.lastAngle!,angle)-current.lastAngle!;current.sweep=(current.sweep??0)+delta;current.lastAngle=angle;
   const start=c.angle,sweep=current.sweep,pose={...c,angle:start+sweep,phase:'drawing' as const,startAngle:start,sweep};
    current.motion[current.motion.length-1]=atAngle(c.center,c.radius,start+sweep);current.nextState={...current.state,compass:pose};current.draft=ed.makeObject(Math.abs(sweep)>=Math.PI*2-1e-6?'circle':'arc',[c.center,atAngle(c.center,c.radius,start)],{center:c.center,radius:c.radius,startAngle:start,sweep});schedule({state:current.nextState,draft:[current.draft]});
  }else if(current.kind==='stroke'){
    const samples=typeof event.nativeEvent.getCoalescedEvents==='function'?event.nativeEvent.getCoalescedEvents():[];for(const sample of(samples.length?samples:[event.nativeEvent])){const raw=world(sample),next=current.edge?{...raw,...projectToLine(raw,...current.edge)}:raw,points=current.draft!.points;if(distance(points.at(-1)!,next)>.18/ed.view.zoom)points.push(next);}schedule({draft:[{...current.draft!}],cursor:current.draft!.points.at(-1)});
  }else if(current.kind==='shape'){
   const original=current.draft!;current.draft=createQuickShape(original.type,current.start,q,{id:original.id,style:original.style,showMeasurements:original.showMeasurements});schedule({draft:[current.draft]});
  }else if(current.kind==='ruler'){
   let end=q;if(ed.mode==='strict'){current.endAnchor=result?.anchor&&result.anchor.kind!=='free'?result.anchor:undefined;const angle=Math.atan2(end.y-current.start.y,end.x-current.start.x);schedule({state:{...ed.toolState,ruler:{...ed.toolState.ruler!,origin:current.start,angle}}});}else if(current.edge)end=projectToLine(p,...current.edge);
   current.draft={...current.draft!,points:[current.start,end]};schedule({draft:[current.draft]});
  }else if(current.kind==='protractor'){const points=[...current.draft!.points];points[2]=q;current.draft={...current.draft!,points};schedule({draft:[current.draft]});
  }else if(current.kind==='object'){
   const object=current.vertex===undefined?translateObject(current.object!,p.x-current.start.x,p.y-current.start.y):moveVertex(current.object!,current.vertex,q);current.draft=object;schedule({draft:[object]});
  }else if(current.kind==='erase'){
   if(ed.eraserMode==='object'){const id=(event.target as Element).closest('[data-shape]')?.getAttribute('data-shape');current.objects=current.objects?.filter(o=>o.id!==id||o.locked);}else eraseAt(current,p);schedule({draft:current.objects});
  }
  current.last=p;
 }
 function up(event:ReactPointerEvent<SVGSVGElement>,cancelled=false){
  const ed=e.current;pointers.current.delete(event.pointerId);
  if(pinch.current||suppress.current){if(!pointers.current.size){pinch.current=null;suppress.current=false;}return;}
  const current=action.current;if(!current||current.pointerId!==event.pointerId)return;
  if(cancelled){cancel();return;}
  if(current.kind!=='pan')move(event);
  cancelAnimationFrame(frame.current);flush();action.current=null;
  if(current.kind==='tool'){
   const finalState=current.nextState??current.state;
    ed.updateTool(finalState,true,{gesture:current.handle?.includes('opening')?'opening':current.handle?.includes('rotate')?'rotate':'move',motion:current.motion,centerAnchor:finalState.compass?.centerAnchor,radiusSource:finalState.compass?.radiusSource},current.tool);
  }else if(current.kind==='compass-draw'&&current.draft&&Math.abs(current.sweep??0)>.002){
    const c=current.state.compass!,state={...current.state,compass:{...c,angle:c.angle+(current.sweep??0),phase:'ready' as const,startAngle:c.angle,sweep:current.sweep}};
   ed.updateTool(state);ed.commitObject(current.draft,'compass',{gesture:'draw',centerAnchor:c.centerAnchor??{kind:'free',point:c.center},radiusSource:c.radiusSource??{kind:'opening'},startAngle:c.angle,sweep:current.sweep,motion:current.motion},state);
  }else if(current.kind==='ruler'){
   if(ed.mode==='strict'&&(!current.endAnchor||!current.draft||distance(...current.draft.points as [Point,Point])<.01)){setPending([{point:current.start,anchor:current.anchor}]);pendingRef.current=[{point:current.start,anchor:current.anchor}];ed.setMessage('已确定第一点，选择第二个已有点或交点');}
    else if(current.draft&&distance(...current.draft.points as [Point,Point])>.01){const pose={...ed.toolState.ruler!,origin:current.start,angle:Math.atan2(current.draft.points[1].y-current.start.y,current.draft.points[1].x-current.start.x),anchors:current.anchor&&current.endAnchor?[current.anchor,current.endAnchor] as [PointAnchor,PointAnchor]:undefined},state=current.tool==='ruler'&&ed.mode==='strict'?{...ed.toolState,ruler:pose}:ed.toolState;ed.updateTool(state);ed.commitObject(current.draft,current.tool==='ruler'?'ruler':'setSquare',{gesture:'draw',anchors:current.anchor&&current.endAnchor?[current.anchor,current.endAnchor]:undefined,motion:current.motion},state);setPending([]);pendingRef.current=[];}
  }else if(current.kind==='object'&&current.draft&&distance(current.start,current.last)>.05)ed.replaceObjects([current.draft],'select',{gesture:'move',motion:current.motion});
  else if(current.kind==='erase'){
   const before=ed.latest.current.objects,after=current.objects!,ids=new Set(after.map(o=>o.id)),changed=after.filter(o=>!before.some(old=>old.id===o.id&&JSON.stringify(old)===JSON.stringify(o))),removed=before.filter(o=>!ids.has(o.id)&&!o.locked).map(o=>o.id);
   if(changed.length||removed.length)ed.emit(recordStep(ed.latest.current,{operation:ed.eraserMode==='partial'?'erase':'delete',tool:'eraser',objects:ed.eraserMode==='partial'?changed:[],removeIds:removed,parameters:{gesture:'draw',motion:current.motion}}));
  }else if(current.draft&&['shape','stroke','protractor'].includes(current.kind)){
    if(current.kind!=='shape'||current.draft.type==='point'||distance(current.start,current.last)>.5)ed.commitObject(current.draft,current.tool,{gesture:'draw',motion:current.kind==='stroke'?undefined:current.motion},current.kind==='stroke'?{...ed.toolState,pen:{position:current.draft.points.at(-1)!,angle:-Math.PI/3,kind:current.draft.pen}}:ed.toolState);
  }
  if(current.kind!=='ruler'||!pendingRef.current.length)ed.setDraft([]);
   setSnap(null);snapRef.current=null;
 }
 function keyDown(event:React.KeyboardEvent<SVGSVGElement>){
   const ed=e.current,target=event.target as Element,handle=target.closest('[data-geo-handle]')?.getAttribute('data-geo-handle'),owner=target.closest('[data-instrument]')?.getAttribute('data-instrument');
   if(ed.canEdit&&handle&&owner&&isInstrument(owner)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
    event.preventDefault();const amount=event.shiftKey?10:2,sign=['ArrowLeft','ArrowDown'].includes(event.key)?-1:1;let state=structuredClone(ed.toolState),gesture:'move'|'rotate'|'opening'='move';
    if(owner==='compass'){
     const c=state.compass!;
     if(handle==='compass-rotate'){state.compass=orientCompass(c,sign*Math.PI/36);gesture='rotate';}
     else if(handle==='compass-opening'){c.radius=clamp(c.radius+sign*amount,12,COMPASS_MAX_RADIUS);c.phase='opening';c.radiusSource={kind:'opening'};gesture='opening';}
     else{c.center={x:c.center.x+(event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0),y:c.center.y+(event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0)};c.centerAnchor={kind:'free',point:c.center};c.phase='position';}
    }else{
     const pose=instrumentPose(state,owner);if(!pose)return;
     if(handle==='instrument-rotate'){pose.angle+=sign*Math.PI/36;gesture='rotate';}else pose.origin={x:pose.origin.x+(event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0),y:pose.origin.y+(event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0)};
     state=withInstrumentPose(state,owner,pose);
    }
    ed.updateTool(state,true,{gesture,centerAnchor:state.compass?.centerAnchor,radiusSource:state.compass?.radiusSource},owner as InstrumentKind);return;
   }
   if(event.key===' '){space.current=true;event.preventDefault();}if(event.key==='Escape'){cancel();return;}if(!e.current.canEdit)return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?e.current.redo():e.current.undo();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();e.current.redo();}if(['Delete','Backspace'].includes(event.key)){event.preventDefault();e.current.remove();}if(event.key==='Enter'&&e.current.tool==='polygon')finishPolygon();}
 useEffect(()=>{const element=svg.current;if(!element)return;const wheel=(event:WheelEvent)=>{event.preventDefault();const p=screenPoint(event);e.current.zoomAt(Math.exp(-event.deltaY*.0015),p.x,p.y);};element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);},[svg]);
 function toggleTransfer(){setTransfer(v=>!v);setPending([]);pendingRef.current=[];e.current.setMessage('选择一个已有线段，或依次选择两个已有点 / 交点');}
 function exactAngle(degrees:number){const ed=e.current;if(ed.mode==='strict'||!ed.canEdit)return;const p=ed.toolState.protractor!,center=p.origin;ed.commitObject(ed.makeObject('angle',[atAngle(center,110,p.angle),center,atAngle(center,110,p.angle-degrees*Math.PI/180)],{showMeasurements:true}),'protractor',{gesture:'draw'});}
  return{cursor,activeSnap,pending,transfer,toggleTransfer,finishPolygon,cancel,exactAngle,activeInstrument:action.current?.instrument,isErasing:action.current?.kind==='erase',movingObjectId:action.current?.kind==='object'?action.current.object?.id:undefined,pointerDown:down,pointerMove:move,pointerUp:(event:ReactPointerEvent<SVGSVGElement>)=>up(event),pointerCancel:(event:ReactPointerEvent<SVGSVGElement>)=>up(event,true),pointerLeave:()=>{if(!action.current){clearVisual();setCursor(null);setSnap(null);snapRef.current=null;}},keyDown,keyUp:(event:React.KeyboardEvent<SVGSVGElement>)=>{if(event.key===' ')space.current=false;}};
}
export type GeometryGestures=ReturnType<typeof useGeometryGestures>;
