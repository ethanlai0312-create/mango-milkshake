import type {CompassPose,DrawingMode,InstrumentKind,Point,RulerPose,ToolState} from '../../../shared/geometry';
import {COMPASS_LEG_LENGTH,INITIAL_TOOLS,add,atAngle,isInstrument,restoredTool,rotate,type EditorTool} from './editor-types';

export const INSTRUMENTS:InstrumentKind[]=['ruler','compass','setSquare45','setSquare30','protractor'];
export function placedInstruments(state:ToolState,mode:DrawingMode):InstrumentKind[]{
 const active=restoredTool(state,mode);
 const saved=state.visibleInstruments??(isInstrument(active)?[active as InstrumentKind]:[]);
 return [...new Set(saved)].filter(id=>INSTRUMENTS.includes(id)&&(mode==='free'||id==='ruler'||id==='compass'));
}
/** Resolve old single-triangle documents without changing their stored history. */
export function instrumentState(state:ToolState|undefined,mode:DrawingMode):ToolState{
 const old=state??{};
 const legacySquare=old.setSquare?{origin:old.setSquare.origin,angle:old.setSquare.angle,length:old.setSquare.length,anchors:old.setSquare.anchors}:undefined;
 return {...INITIAL_TOOLS,...old,
  compass:{...INITIAL_TOOLS.compass!,...old.compass,penDown:old.compass?.penDown??old.compass?.phase==='drawing'},
  setSquare45:old.setSquare45??(old.setSquare?.variant!=='30'?legacySquare:undefined)??{origin:{x:260,y:300},angle:0,length:220},
  setSquare30:old.setSquare30??(old.setSquare?.variant==='30'?legacySquare:undefined)??{origin:{x:490,y:390},angle:0,length:220},
  visibleInstruments:placedInstruments(old,mode),
 };
}
export function selectInstrument(state:ToolState,tool:EditorTool,mode:DrawingMode):ToolState{
 const current=instrumentState(state,mode),visible=placedInstruments(current,mode);
 return {...current,activeTool:tool,visibleInstruments:isInstrument(tool)?[...visible.filter(id=>id!==tool),tool as InstrumentKind]:visible};
}
export function instrumentPose(state:ToolState,tool:string):RulerPose|undefined{
 return tool==='ruler'?state.ruler:tool==='protractor'?state.protractor:tool==='setSquare45'?state.setSquare45??state.setSquare:tool==='setSquare30'?state.setSquare30??state.setSquare:undefined;
}
export function withInstrumentPose(state:ToolState,tool:string,pose:RulerPose):ToolState{
 if(tool==='setSquare45'||tool==='setSquare30')return {...state,[tool]:pose,setSquare:{...pose,variant:tool==='setSquare30'?'30':'45'}};
 return {...state,[tool]:pose};
}
/** Lifted orientation changes the angle only, never creates a curve or alters the opening. */
export function orientCompass(pose:CompassPose,sweep:number):CompassPose{
 return {...pose,angle:pose.angle+sweep,phase:pose.phase==='drawing'?'ready':pose.phase,penDown:false};
}
export function instrumentBounds(state:ToolState,mode:DrawingMode):Point[]{
 const points:Point[]=[];
 for(const id of placedInstruments(state,mode)){
  if(id==='compass'&&state.compass){const c=state.compass,hinge={x:c.radius/2,y:Math.sqrt(Math.max(0,COMPASS_LEG_LENGTH**2-c.radius**2/4))};points.push(c.center,atAngle(c.center,c.radius,c.angle),add(c.center,rotate(add(hinge,{x:0,y:26}),c.angle)));}
  else{const pose=instrumentPose(state,id);if(!pose)continue;const l=pose.length??(id==='protractor'?150:220),triangle=id.startsWith('setSquare'),h=triangle?(id==='setSquare30'?l/Math.sqrt(3):l):id==='protractor'?l:0;
   const box=id==='protractor'?{left:-l-26,right:l+26,top:-l-26,bottom:l+26}:{left:-10,right:l+26,top:-h,bottom:44};const local=[{x:box.left,y:box.top},{x:box.left,y:box.bottom},{x:box.right,y:box.top},{x:box.right,y:box.bottom}];for(const p of local)points.push(add(pose.origin,rotate(p,pose.angle)));}
 }
 return points;
}
