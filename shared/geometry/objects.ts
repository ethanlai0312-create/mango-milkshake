import type {DrawingMode,GeometryObject,GeometryType,ObjectOptions,ObjectStyle,PenKind,Point} from './types.ts';
import {angleOf,distance,midpoint,pointOnCircle,TAU} from './math.ts';

export const DEFAULT_STYLE:Readonly<ObjectStyle> = Object.freeze({color:'#26364b',width:2,opacity:1,lineStyle:'solid'});
export const PEN_STYLES:Readonly<Record<PenKind,Readonly<ObjectStyle>>> = Object.freeze({
 ballpoint:Object.freeze({...DEFAULT_STYLE,width:1.8}),
 highlighter:Object.freeze({...DEFAULT_STYLE,color:'#ffe34d',width:14,opacity:.28}),
 pencil:Object.freeze({...DEFAULT_STYLE,color:'#52525b',width:1.5,opacity:.85}),
 fountain:Object.freeze({...DEFAULT_STYLE,color:'#172b4d',width:2.4}),
});
export function clone<T>(value:T):T {return structuredClone(value);}
export function geometryId(){return globalThis.crypto.randomUUID();}
export function createObject(type:GeometryType,points:Point[],options:ObjectOptions={}):GeometryObject {
 const pen=options.pen??(type==='highlight'?'highlighter':type==='stroke'?'ballpoint':undefined);
 const {style,...rest}=clone(options);
 const object:GeometryObject={locked:false,layer:type==='highlight'?'highlight':type==='stroke'?'handwriting':'geometry',dependencies:[],...rest,id:options.id??geometryId(),type,points:clone(points),style:{...(pen?PEN_STYLES[pen]:DEFAULT_STYLE),...style}};
 if(pen)object.pen=pen;
 if(type==='circle'||type==='arc'){
  object.center=clone(options.center??points[0]??{x:0,y:0});
  object.radius=options.radius??(points[1]?distance(object.center,points[1]):0);
  if(type==='arc'){object.startAngle=options.startAngle??(points[1]?angleOf(object.center,points[1]):0);object.sweep=options.sweep??Math.PI;}
 }
 return object;
}
export const createGeometryObject=createObject;
export function createStroke(points:Point[],pen:PenKind='ballpoint',style:Partial<ObjectStyle>={}):GeometryObject {
 return createObject(pen==='highlighter'?'highlight':'stroke',points,{pen,style});
}
export function createQuickShape(type:GeometryType,a:Point,b:Point,options:ObjectOptions={}):GeometryObject {
 const dx=b.x-a.x,dy=b.y-a.y;let points:Point[]=[a,b];
 if(type==='square'){const side=Math.max(Math.abs(dx),Math.abs(dy)),x=a.x+Math.sign(dx||1)*side,y=a.y+Math.sign(dy||1)*side;points=[a,{x,y:a.y},{x,y},{x:a.x,y}];}
 else if(type==='rectangle')points=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];
 else if(type==='triangle'||type==='isoscelesTriangle')points=[{x:a.x,y:b.y},{x:(a.x+b.x)/2,y:a.y},b];
 else if(type==='equilateralTriangle'){
  points=[a,b,{x:(a.x+b.x)/2-dy*Math.sqrt(3)/2,y:(a.y+b.y)/2+dx*Math.sqrt(3)/2}];
 }else if(type==='rightTriangle')points=[a,{x:b.x,y:a.y},b];
 else if(type==='parallelogram'){const offset=dx*.25;points=[{x:a.x+offset,y:a.y},{x:b.x,y:a.y},{x:b.x-offset,y:b.y},{x:a.x,y:b.y}];}
 else if(type==='rhombus'){const m=midpoint(a,b);points=[{x:m.x,y:a.y},{x:b.x,y:m.y},{x:m.x,y:b.y},{x:a.x,y:m.y}];}
 else if(type==='trapezoid')points=[{x:a.x+dx*.25,y:a.y},{x:b.x-dx*.25,y:a.y},b,{x:a.x,y:b.y}];
 else if(type==='ellipse')return createObject(type,points,{...options,center:midpoint(a,b),radiusX:Math.abs(dx)/2,radiusY:Math.abs(dy)/2,rotation:options.rotation??0});
 else if(type==='circle'||type==='arc')return createObject(type,points,{...options,center:a,radius:distance(a,b)});
 else if(type==='point')points=[a];
 return createObject(type,points,options);
}
export function translateObject(object:GeometryObject,dx:number,dy:number):GeometryObject {
 if(object.locked)return clone(object);
 const moved=clone(object);moved.points=moved.points.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
 if(moved.center)moved.center={...moved.center,x:moved.center.x+dx,y:moved.center.y+dy};return moved;
}
/** Vertex edits reconstruct constrained shapes instead of silently changing their type. */
export function moveVertex(object:GeometryObject,index:number,p:Point):GeometryObject {
 if(object.locked||!object.points[index])return clone(object);
 if(object.points[index].x===p.x&&object.points[index].y===p.y)return clone(object);
 // These constrained families are edited by parameters/whole-object transforms only.
 if(['rhombus','isoscelesTriangle','rightTriangle','trapezoid'].includes(object.type))return clone(object);
 const next=clone(object),n=object.points.length;
 if(object.type==='square'&&n===4){
  const fixed=object.points[(index+2)%4],d={x:p.x-fixed.x,y:p.y-fixed.y},sign=Math.sign((object.points[(index+3)%4].x-fixed.x)*(object.points[(index+1)%4].y-fixed.y)-(object.points[(index+3)%4].y-fixed.y)*(object.points[(index+1)%4].x-fixed.x))||1;
  const u={x:(d.x+sign*d.y)/2,y:(d.y-sign*d.x)/2};
  next.points[index]=clone(p);next.points[(index+2)%4]=clone(fixed);next.points[(index+3)%4]={x:fixed.x+u.x,y:fixed.y+u.y};next.points[(index+1)%4]={x:fixed.x+d.x-u.x,y:fixed.y+d.y-u.y};
 }else if(object.type==='rectangle'&&n===4){
  const fixed=object.points[(index+2)%4],adj=object.points[(index+3)%4],len=distance(fixed,adj);if(!len)return next;
  const u={x:(adj.x-fixed.x)/len,y:(adj.y-fixed.y)/len},d={x:p.x-fixed.x,y:p.y-fixed.y},along=d.x*u.x+d.y*u.y;
  next.points[index]=clone(p);next.points[(index+3)%4]={x:fixed.x+along*u.x,y:fixed.y+along*u.y};next.points[(index+1)%4]={x:p.x-along*u.x,y:p.y-along*u.y};
 }else if(object.type==='parallelogram'&&n===4){
  const delta={x:p.x-next.points[index].x,y:p.y-next.points[index].y};next.points[index]=clone(p);const opposite=(index+2)%4;next.points[opposite]={x:next.points[opposite].x-delta.x,y:next.points[opposite].y-delta.y};
 }else if(object.type==='equilateralTriangle'&&n===3){
  const fixed=object.points[(index+1)%3],dx=p.x-fixed.x,dy=p.y-fixed.y;
  const a=object.points[0],b=object.points[1],c=object.points[2],winding=Math.sign((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))||1;
  next.points[index]=clone(p);next.points[(index+2)%3]={x:fixed.x+dx/2+winding*dy*Math.sqrt(3)/2,y:fixed.y+dy/2-winding*dx*Math.sqrt(3)/2};
 }else next.points[index]=clone(p);
 if((object.type==='circle'||object.type==='arc')&&object.center){
  if(index===0)return translateObject(object,p.x-object.center.x,p.y-object.center.y);
  next.radius=distance(object.center,p);if(object.type==='arc')next.startAngle=angleOf(object.center,p);
 }
 return next;
}

/** Explicit points available to a straightedge. Arbitrary circle rim samples are not vertices. */
export function objectVertices(object:GeometryObject):{point:Point;pointIndex:number}[] {
 if(object.type==='circle'||object.type==='arc'||object.type==='ellipse')return [{point:object.center??object.points[0],pointIndex:0}];
 if(object.type==='stroke'||object.type==='highlight'||object.type==='text'||object.type==='length')return [];
 return object.points.map((point,pointIndex)=>({point,pointIndex}));
}
export function toolAllowed(tool:string,mode:DrawingMode){return mode==='free'||['ruler','compass','select','undo','redo'].includes(tool);}
export function strokeWidth(object:GeometryObject,point:Point){
 if(object.pen==='highlighter'||point.pressure===undefined)return object.style.width;
 const pressure=Math.max(0,Math.min(1,point.pressure));
 return object.style.width*(object.pen==='fountain'?.45+pressure*1.05:object.pen==='pencil'?.6+pressure*.65:.85+pressure*.3);
}
/** A deterministic quadratic path; identical stored samples always produce identical ink. */
export function smoothStrokePath(points:Point[]){
 if(!points.length)return '';if(points.length===1)return `M ${points[0].x} ${points[0].y} l 0.001 0`;
 let path=`M ${points[0].x} ${points[0].y}`;
 for(let i=1;i<points.length-1;i++){const m=midpoint(points[i],points[i+1]);path+=` Q ${points[i].x} ${points[i].y} ${m.x} ${m.y}`;}
 const last=points.at(-1)!;return path+` L ${last.x} ${last.y}`;
}
export function arcPath(center:Point,radius:number,startAngle:number,sweep:number){
 const start=pointOnCircle(center,radius,startAngle);let path=`M ${start.x} ${start.y}`;
 const count=Math.max(1,Math.ceil(Math.abs(sweep)/Math.PI)),part=sweep/count;
 for(let i=1;i<=count;i++){const p=pointOnCircle(center,radius,startAngle+part*i);path+=` A ${radius} ${radius} 0 ${Math.abs(part)>Math.PI?1:0} ${sweep>=0?1:0} ${p.x} ${p.y}`;}
 return path;
}
export const FULL_CIRCLE=TAU;
