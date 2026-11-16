import type {DrawingInput,DrawingMode,GeometryType,ObjectStyle,PenKind,Point,ToolState} from '../../../shared/geometry';
import {equalData} from '../../../shared/geometry/timeline';
export function sameDrawingContent(a:import('../../../shared/geometry').DrawingDocument,b:import('../../../shared/geometry').DrawingDocument){
 const content=(d:typeof a)=>({...d,steps:d.steps.map(({context,...step})=>step)});
 return equalData(content(a),content(b));
}

export type EditorTool = 'select'|'pan'|'ruler'|'setSquare45'|'setSquare30'|'protractor'|'compass'|PenKind|'eraser'|GeometryType;
export type Viewport = {x:number;y:number;zoom:number};
export function fitObjectViewport(objects:import('../../../shared/geometry').GeometryObject[],extraPoints:Point[]=[]):Viewport{
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;const include=(p:Point)=>{if(Number.isFinite(p.x)&&Number.isFinite(p.y)){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}};
 for(const o of objects){if(o.visible===false)continue;
  if((o.type==='circle'||o.type==='arc')&&o.center&&o.radius){include({x:o.center.x-o.radius,y:o.center.y-o.radius});include({x:o.center.x+o.radius,y:o.center.y+o.radius});}
  else if(o.type==='ellipse'&&o.center&&o.radiusX&&o.radiusY){const a=o.rotation??0,rx=Math.hypot(o.radiusX*Math.cos(a),o.radiusY*Math.sin(a)),ry=Math.hypot(o.radiusX*Math.sin(a),o.radiusY*Math.cos(a));include({x:o.center.x-rx,y:o.center.y-ry});include({x:o.center.x+rx,y:o.center.y+ry});}
  else{o.points.forEach(include);if(o.type==='text'&&o.points[0])include({x:o.points[0].x+(o.text?.length??0)*14,y:o.points[0].y-20});}
 }
 extraPoints.forEach(include);
 if(!Number.isFinite(minX))return{x:0,y:0,zoom:1};
 if(minX>=20&&maxX<=780&&minY>=20&&maxY<=480)return{x:0,y:0,zoom:1};
 const zoom=Math.min(1,760/Math.max(1,maxX-minX),460/Math.max(1,maxY-minY));return{x:400-(minX+maxX)/2*zoom,y:250-(minY+maxY)/2*zoom,zoom};
}
export type DrawingProps = {value?:DrawingInput;onChange:(next:import('../../../shared/geometry').DrawingDocument)=>void;readOnly?:boolean;mode?:DrawingMode;initial?:DrawingInput;authoring?:boolean};
export const PEN_TOOLS:PenKind[]=['ballpoint','highlighter','pencil','fountain'];
export const TOOL_LABELS:Record<string,string>={select:'选择',pan:'平移',ballpoint:'圆珠笔',highlighter:'荧光笔',pencil:'铅笔',fountain:'钢笔',eraser:'橡皮擦',ruler:'直尺',setSquare45:'45° 三角尺',setSquare30:'30° 三角尺',protractor:'量角器',compass:'圆规',point:'点',segment:'线段',line:'直线',ray:'射线',circle:'圆',arc:'圆弧',ellipse:'椭圆',triangle:'三角形',isoscelesTriangle:'等腰三角形',equilateralTriangle:'等边三角形',rightTriangle:'直角三角形',rectangle:'矩形',square:'正方形',parallelogram:'平行四边形',rhombus:'菱形',trapezoid:'梯形',polygon:'多边形',angle:'角度标记',length:'长度标注',text:'文字'};
export const SHAPE_TOOLS:GeometryType[]=['point','segment','ray','line','circle','arc','ellipse','triangle','isoscelesTriangle','equilateralTriangle','rightTriangle','rectangle','square','parallelogram','rhombus','trapezoid','polygon','angle','length','text'];
export function restoredTool(state:ToolState|undefined,mode:DrawingMode):EditorTool{
 const saved=state?.activeTool==='setSquare'?(state.setSquare?.variant==='30'?'setSquare30':'setSquare45'):state?.activeTool;
 return saved&&TOOL_LABELS[saved]&&(mode!=='strict'||['ruler','compass','select','pan'].includes(saved))?saved as EditorTool:mode==='strict'?'ruler':'ballpoint';
}
export const BASE_STYLE:ObjectStyle={color:'#26364b',width:1.8,opacity:1,lineStyle:'solid'};
export const COMPASS_LEG_LENGTH=180;
export const COMPASS_MAX_RADIUS=350;
export const DEFAULT_STYLES:Record<string,ObjectStyle>={ballpoint:{...BASE_STYLE},highlighter:{...BASE_STYLE,color:'#ffd83d',width:14,opacity:.28},pencil:{...BASE_STYLE,color:'#55565b',width:1.6,opacity:.85},fountain:{...BASE_STYLE,color:'#18345e',width:2.4},geometry:{...BASE_STYLE,width:2}};
export const INITIAL_TOOLS:ToolState={activeTool:'ballpoint',ruler:{origin:{x:240,y:260},angle:0,length:300},setSquare:{origin:{x:280,y:300},angle:0,length:220,variant:'45'},protractor:{origin:{x:400,y:300},angle:0,length:150},compass:{center:{x:380,y:250},radius:115,angle:Math.PI/2,phase:'position',penDown:false,radiusSource:{kind:'opening'}}};
export const isPen=(tool:string):tool is PenKind=>PEN_TOOLS.includes(tool as PenKind);
export const isInstrument=(tool:string)=>['ruler','setSquare45','setSquare30','protractor','compass'].includes(tool);
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export const add=(a:Point,b:Point):Point=>({x:a.x+b.x,y:a.y+b.y});
export const subtract=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y});
export const rotate=(p:Point,angle:number):Point=>({x:p.x*Math.cos(angle)-p.y*Math.sin(angle),y:p.x*Math.sin(angle)+p.y*Math.cos(angle)});
export const atAngle=(center:Point,radius:number,angle:number):Point=>add(center,{x:radius*Math.cos(angle),y:radius*Math.sin(angle)});
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function projectToLine(point:Point,a:Point,b:Point):Point{const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy;if(d<1e-12)return a;const t=((point.x-a.x)*dx+(point.y-a.y)*dy)/d;return{x:a.x+t*dx,y:a.y+t*dy};}
export function instrumentEdges(tool:string,state:ToolState):[Point,Point][]{
 const pose=tool==='ruler'?state.ruler:tool==='setSquare30'?state.setSquare30??state.setSquare:state.setSquare45??state.setSquare;if(!pose)return[];const l=pose.length??220;
 const vertices=tool==='ruler'?[{x:0,y:0},{x:l,y:0}]:[{x:0,y:0},{x:l,y:0},{x:0,y:-(tool==='setSquare30'?l/Math.sqrt(3):l)}];
 return vertices.map(p=>add(pose.origin,rotate(p,pose.angle))).map((p,i,all)=>[p,all[(i+1)%all.length]] as [Point,Point]).slice(0,tool==='ruler'?1:3);
}
export function smoothPath(points:Point[]):string{
 if(!points.length)return'';if(points.length===1)return`M ${points[0].x} ${points[0].y} l .01 .01`;
 let path=`M ${points[0].x} ${points[0].y}`;
 for(let i=1;i<points.length-1;i++){const p=points[i],n=points[i+1];path+=` Q ${p.x} ${p.y} ${(p.x+n.x)/2} ${(p.y+n.y)/2}`;}
 const end=points.at(-1)!;return`${path} L ${end.x} ${end.y}`;
}
/** One filled outline per stroke avoids opacity build-up between pressure samples. */
export function pressureOutline(points:Point[],width:number,kind:PenKind):string{
 if(points.length<2)return'';const left:Point[]=[],right:Point[]=[];
 for(let i=0;i<points.length;i++){const p=points[i],prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],dx=next.x-prev.x,dy=next.y-prev.y,l=Math.hypot(dx,dy)||1,pressure=clamp(p.pressure??.5,.05,1),factor=kind==='pencil'?.55+.65*pressure:.55+.8*pressure,half=width*factor/2;left.push({x:p.x-dy/l*half,y:p.y+dx/l*half});right.push({x:p.x+dy/l*half,y:p.y-dx/l*half});}
 return`M ${left.map(p=>`${p.x} ${p.y}`).join(' L ')} L ${right.reverse().map(p=>`${p.x} ${p.y}`).join(' L ')} Z`;
}
export function arcPath(center:Point,radius:number,start:number,sweep:number):string{
 const begin=atAngle(center,radius,start);let path=`M ${begin.x} ${begin.y}`;const pieces=Math.max(1,Math.ceil(Math.abs(sweep)/Math.PI));
 for(let i=1;i<=pieces;i++){const p=atAngle(center,radius,start+sweep*i/pieces);path+=` A ${radius} ${radius} 0 0 ${sweep>=0?1:0} ${p.x} ${p.y}`;}return path;
}
