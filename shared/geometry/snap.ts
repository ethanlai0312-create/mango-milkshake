import type {GeometryObject,Point,PointAnchor,RadiusSource,SnapOptions,SnapResult} from './types.ts';
import {angleOf,distance,intersections,midpoint,pointOnArc,pointOnCircle,projectOnLine,samePoint} from './math.ts';
import {clone,objectVertices} from './objects.ts';

export function resolveAnchor(anchor:PointAnchor,objects:GeometryObject[],allowFree=false):Point|null {
 if(!anchor||typeof anchor!=='object')return null;
 if(anchor.kind==='free')return allowFree&&anchor.point&&Number.isFinite(anchor.point.x)&&Number.isFinite(anchor.point.y)?clone(anchor.point):null;
 if(anchor.kind==='point'){
  const object=objects.find(o=>o.id===anchor.objectId);if(!object)return null;
  return clone(objectVertices(object).find(v=>v.pointIndex===(anchor.pointIndex??0))?.point??null);
 }
 if(anchor.kind==='intersection'&&Array.isArray(anchor.objectIds)&&anchor.objectIds.length===2&&anchor.objectIds[0]!==anchor.objectIds[1]&&Number.isInteger(anchor.index)&&anchor.index>=0){
  const a=objects.find(o=>o.id===anchor.objectIds[0]),b=objects.find(o=>o.id===anchor.objectIds[1]);
  return a&&b?intersections(a,b)[anchor.index]??null:null;
 }
 return null;
}
export function anchorDependencies(anchor:PointAnchor):string[] {
 return anchor.kind==='point'?[anchor.objectId]:anchor.kind==='intersection'?[...anchor.objectIds]:[];
}
export function radiusFromSource(source:RadiusSource|undefined,objects:GeometryObject[]):number|null {
 if(!source||source.kind==='opening')return null;
 if(source.kind==='segment'){
  const object=objects.find(o=>o.id===source.objectId);return object?.type==='segment'&&object.points.length===2?distance(object.points[0],object.points[1]):null;
 }
 if(source.kind==='points'&&source.anchors?.length===2){const a=resolveAnchor(source.anchors[0],objects),b=resolveAnchor(source.anchors[1],objects);return a&&b?distance(a,b):null;}
 return null;
}
export function radiusDependencies(source:RadiusSource|undefined):string[] {
 return !source||source.kind==='opening'?[]:source.kind==='segment'?[source.objectId]:source.anchors.flatMap(anchorDependencies);
}
const lineTypes=new Set(['line','segment','ray']);
const polygons=new Set(['triangle','isoscelesTriangle','equilateralTriangle','rightTriangle','rectangle','square','parallelogram','rhombus','trapezoid','polygon','angle']);
function lineEdges(object:GeometryObject):[Point,Point,'line'|'segment'|'ray'][] {
 if(lineTypes.has(object.type)&&object.points.length>=2)return [[object.points[0],object.points[1],object.type as 'line'|'segment'|'ray']];
 if(!polygons.has(object.type))return [];
 return object.points.slice(0,object.type==='angle'?-1:undefined).map((p,i)=>[p,object.points[(i+1)%object.points.length],'segment']);
}
function nearBoundary(p:Point,o:GeometryObject,threshold:number){
 if((o.type==='circle'||o.type==='arc')&&o.center&&o.radius!==undefined)return Math.abs(distance(p,o.center)-o.radius)<=threshold&&(o.type!=='arc'||pointOnArc(pointOnCircle(o.center,o.radius,angleOf(o.center,p)),o.center,o.radius,o.startAngle??0,o.sweep??0,threshold));
 return lineEdges(o).some(([a,b,type])=>distance(p,projectOnLine(p,a,b,type))<=threshold);
}
const labels={point:'已有点',endpoint:'端点',intersection:'交点',center:'圆心',midpoint:'中点',onLine:'线上的点',onCircle:'圆周',grid:'网格',horizontal:'水平',vertical:'垂直',angle:'角度方向',parallel:'平行',equalLength:'等长'};
const priorities={point:0,endpoint:0,intersection:1,center:2,midpoint:3,onLine:8,onCircle:8,grid:9,horizontal:6,vertical:6,angle:7,parallel:7,equalLength:7};
/** The tolerance is screen-sized; the returned coordinates stay in mathematical space. */
export function snapPoint(point:Point,objects:GeometryObject[],options:SnapOptions={}):SnapResult|null {
 const strict=options.mode==='strict',zoom=Math.max(.01,options.zoom??1),threshold=(options.threshold??(options.pointerType==='touch'?18:options.pointerType==='pen'?12:10))/zoom;
 const candidates:SnapResult[]=[],visible=objects.filter(o=>o.visible!==false&&!options.excludeIds?.includes(o.id));
 const push=(p:Point,kind:SnapResult['kind'],objectIds:string[]=[],anchor?:PointAnchor)=>{
  const d=distance(point,p);if(Number.isFinite(d)&&d<=threshold*1.35)candidates.push({point:clone(p),kind,distance:d,objectIds,anchor,label:labels[kind]});
 };
 for(const object of visible){
  for(const vertex of objectVertices(object))push(vertex.point,object.type==='point'?'point':['circle','arc','ellipse'].includes(object.type)?'center':'endpoint',[object.id],{kind:'point',objectId:object.id,pointIndex:vertex.pointIndex});
  if(!strict){
   for(const [a,b,type] of lineEdges(object)){
    if(type==='segment')push(midpoint(a,b),'midpoint',[object.id]);
    push(projectOnLine(point,a,b,type),'onLine',[object.id]);
   }
   if((object.type==='circle'||object.type==='arc')&&object.center&&object.radius){const p=pointOnCircle(object.center,object.radius,angleOf(object.center,point));if(object.type==='circle'||pointOnArc(p,object.center,object.radius,object.startAngle??0,object.sweep??0))push(p,'onCircle',[object.id]);}
  }
 }
 // Only nearby boundaries can produce a nearby intersection. Avoid all-pairs work on ink.
 const local=visible.filter(o=>nearBoundary(point,o,threshold*1.35)).slice(0,96);
 for(let i=0;i<local.length;i++)for(let j=i+1;j<local.length;j++)intersections(local[i],local[j]).forEach((p,index)=>push(p,'intersection',[local[i].id,local[j].id],{kind:'intersection',objectIds:[local[i].id,local[j].id],index}));
 if(!strict){
  if(options.grid&&options.grid>0)push({x:Math.round(point.x/options.grid)*options.grid,y:Math.round(point.y/options.grid)*options.grid},'grid');
  if(options.origin){
   const origin=options.origin,length=distance(origin,point);push({x:point.x,y:origin.y},'horizontal');push({x:origin.x,y:point.y},'vertical');
   for(const angle of options.angles??[])push(pointOnCircle(origin,length,angle),'angle');
   for(const object of visible)for(const [a,b] of lineEdges(object)){
    const angle=angleOf(a,b);push(pointOnCircle(origin,length,angle),'parallel',[object.id]);push(pointOnCircle(origin,length,angle+Math.PI),'parallel',[object.id]);
    if(object.type==='segment')push(pointOnCircle(origin,distance(a,b),angleOf(origin,point)),'equalLength',[object.id]);
   }
  }
 }
 // Retain a still-valid previous target within the wider release radius (hysteresis).
 const previous=options.previous,retained=previous&&candidates.find(c=>c.kind===previous.kind&&c.objectIds.join('|')===previous.objectIds.join('|')&&samePoint(c.point,previous.point));
 if(retained)return retained;
 return candidates.filter(c=>c.distance<=threshold).sort((a,b)=>priorities[a.kind]-priorities[b.kind]||a.distance-b.distance||a.objectIds.join('|').localeCompare(b.objectIds.join('|')))[0]??null;
}
