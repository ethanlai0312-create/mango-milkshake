import type {GeometryObject, Point} from './types.ts';

export const TAU = Math.PI * 2;
export const EPSILON = 1e-9;
export const distance = (a:Point,b:Point) => Math.hypot(b.x-a.x,b.y-a.y);
export const add = (a:Point,b:Point):Point => ({x:a.x+b.x,y:a.y+b.y});
export const subtract = (a:Point,b:Point):Point => ({x:a.x-b.x,y:a.y-b.y});
export const dot = (a:Point,b:Point) => a.x*b.x+a.y*b.y;
export const cross = (a:Point,b:Point) => a.x*b.y-a.y*b.x;
export const midpoint = (a:Point,b:Point):Point => ({x:a.x+(b.x-a.x)/2,y:a.y+(b.y-a.y)/2});
export const angleOf = (center:Point,p:Point) => Math.atan2(p.y-center.y,p.x-center.x);
export const pointOnCircle = (center:Point,radius:number,angle:number):Point => ({x:center.x+radius*Math.cos(angle),y:center.y+radius*Math.sin(angle)});
export const normalizeAngle = (angle:number) => ((angle%TAU)+TAU)%TAU;
export const nearlyEqual = (a:number,b:number,epsilon=EPSILON) => Math.abs(a-b)<=epsilon*Math.max(1,Math.abs(a),Math.abs(b));

/** Local geometry scale and machine precision both matter after large translations. */
export function geometryTolerance(...points:Point[]) {
 let magnitude=0,span=0;const origin=points[0];
 for(const p of points){magnitude=Math.max(magnitude,Math.abs(p.x),Math.abs(p.y));if(origin)span=Math.max(span,distance(origin,p));}
 return Math.max(1e-12,span*1e-10,magnitude*Number.EPSILON*32);
}
export function samePoint(a:Point,b:Point,tolerance=geometryTolerance(a,b)) {return distance(a,b)<=tolerance;}
/** Add the shortest signed angular delta to an already unwrapped previous angle. */
export function unwrapAngle(previous:number,next:number) {return previous+Math.atan2(Math.sin(next-previous),Math.cos(next-previous));}
export function angleBetween(a:Point,vertex:Point,b:Point) {
 const u=subtract(a,vertex),v=subtract(b,vertex);
 if(distance(a,vertex)<=geometryTolerance(a,vertex)||distance(b,vertex)<=geometryTolerance(b,vertex))return 0;
 return Math.atan2(Math.abs(cross(u,v)),dot(u,v));
}
export function pointOnArc(p:Point,center:Point,radius:number,startAngle:number,sweep:number,tolerance=geometryTolerance(p,center)) {
 if(Math.abs(distance(p,center)-radius)>tolerance)return false;
 if(Math.abs(sweep)>=TAU-1e-10)return true;
 const angularTolerance=tolerance/Math.max(radius,tolerance);
 const travelled=sweep>=0?normalizeAngle(angleOf(center,p)-startAngle):normalizeAngle(startAngle-angleOf(center,p));
 return travelled<=Math.abs(sweep)+angularTolerance||TAU-travelled<=angularTolerance;
}

type LinearType='line'|'segment'|'ray';
function inDomain(t:number,length:number,type:LinearType,tolerance:number){return type==='line'||(t>=-tolerance&&(type==='ray'||t<=length+tolerance));}
export function projectOnLine(p:Point,a:Point,b:Point,type:LinearType='line'):Point {
 const length=distance(a,b);if(length<=geometryTolerance(a,b))return {...a};
 const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
 let t=(p.x-a.x)*ux+(p.y-a.y)*uy;
 if(type!=='line')t=Math.max(0,t);if(type==='segment')t=Math.min(length,t);
 return {x:a.x+t*ux,y:a.y+t*uy};
}
export function lineLineIntersection(a:Point,b:Point,c:Point,d:Point,typeA:LinearType='line',typeB:LinearType='line'):Point[] {
 const l1=distance(a,b),l2=distance(c,d),tolerance=geometryTolerance(a,b,c,d);
 if(l1<=tolerance||l2<=tolerance)return [];
 const u={x:(b.x-a.x)/l1,y:(b.y-a.y)/l1},v={x:(d.x-c.x)/l2,y:(d.y-c.y)/l2},denom=cross(u,v),q=subtract(c,a);
 // Coincident lines have infinitely many intersections, not a new constructible point.
 if(Math.abs(denom)<=1e-12)return [];
 const t=cross(q,v)/denom,s=cross(q,u)/denom;
 if(!inDomain(t,l1,typeA,tolerance)||!inDomain(s,l2,typeB,tolerance))return [];
 const p={x:a.x+t*u.x,y:a.y+t*u.y};return Number.isFinite(p.x)&&Number.isFinite(p.y)?[p]:[];
}
export function lineCircleIntersections(a:Point,b:Point,center:Point,radius:number,type:LinearType='line'):Point[] {
 const length=distance(a,b),tolerance=geometryTolerance(a,b,center);
 if(length<=tolerance||radius<=0||!Number.isFinite(radius))return [];
 const u={x:(b.x-a.x)/length,y:(b.y-a.y)/length},w=subtract(center,a),along=dot(w,u),perpendicular=Math.abs(cross(w,u));
 if(perpendicular>radius+tolerance)return [];
 const half=Math.sqrt(Math.max(0,(radius-perpendicular)*(radius+perpendicular)));
 const ts=half<=tolerance?[along]:[along-half,along+half];
 return ts.filter(t=>inDomain(t,length,type,tolerance)).map(t=>({x:a.x+t*u.x,y:a.y+t*u.y}));
}
export function circleCircleIntersections(c1:Point,r1:number,c2:Point,r2:number):Point[] {
 const d=distance(c1,c2),tolerance=geometryTolerance(c1,c2,{x:c1.x+r1,y:c1.y},{x:c2.x+r2,y:c2.y});
 if(r1<=0||r2<=0||!Number.isFinite(r1+r2)||d<=tolerance||d>r1+r2+tolerance||d<Math.abs(r1-r2)-tolerance)return [];
 const along=((r1-r2)*(r1+r2)+d*d)/(2*d),h=Math.sqrt(Math.max(0,(r1-along)*(r1+along)));
 const ux=(c2.x-c1.x)/d,uy=(c2.y-c1.y)/d,base={x:c1.x+along*ux,y:c1.y+along*uy};
 return h<=tolerance?[base]:[{x:base.x-h*uy,y:base.y+h*ux},{x:base.x+h*uy,y:base.y-h*ux}];
}

const circular=(o:GeometryObject)=>o.type==='circle'||o.type==='arc';
const linear=(o:GeometryObject)=>o.type==='line'||o.type==='segment'||o.type==='ray';
const polygonal=new Set(['triangle','isoscelesTriangle','equilateralTriangle','rightTriangle','rectangle','square','parallelogram','rhombus','trapezoid','polygon','angle']);
function edges(o:GeometryObject):GeometryObject[] {
 if(linear(o))return [o];if(!polygonal.has(o.type))return [];
 const closed=o.type!=='angle',count=o.points.length-(closed?0:1);
 return Array.from({length:count},(_,i)=>({...o,type:'segment',points:[o.points[i],o.points[(i+1)%o.points.length]]}));
}
function filterArc(points:Point[],o:GeometryObject){return o.type==='arc'?points.filter(p=>pointOnArc(p,o.center??o.points[0],o.radius??0,o.startAngle??0,o.sweep??0)):points;}
/** Finite, deterministic intersection order. Segment/ray domains and arc sweeps are respected. */
export function intersections(a:GeometryObject,b:GeometryObject):Point[] {
 if(a.id===b.id)return [];
 let result:Point[]=[];
 if(circular(a)&&circular(b))result=filterArc(filterArc(circleCircleIntersections(a.center??a.points[0],a.radius??0,b.center??b.points[0],b.radius??0),a),b);
 else if(circular(a)||circular(b)){
  const circle=circular(a)?a:b,other=circular(a)?b:a;
  result=edges(other).flatMap(edge=>filterArc(lineCircleIntersections(edge.points[0],edge.points[1],circle.center??circle.points[0],circle.radius??0,edge.type as LinearType),circle));
 }else result=edges(a).flatMap(e1=>edges(b).flatMap(e2=>lineLineIntersection(e1.points[0],e1.points[1],e2.points[0],e2.points[1],e1.type as LinearType,e2.type as LinearType)));
 return result.filter((p,i,all)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&!all.slice(0,i).some(other=>samePoint(p,other))).sort((p,q)=>p.x-q.x||p.y-q.y);
}

export function formatLength(length:number){return length.toFixed(2);}
export function formatAngle(radians:number){return (radians*180/Math.PI).toFixed(1)+'°';}
