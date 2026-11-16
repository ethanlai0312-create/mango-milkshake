import type {GeometryObject,Point} from '../../../shared/geometry';
import {distance} from './editor-types';

/** Cut vector polylines at a circular eraser boundary, retaining pressure and tilt. */
export function eraseStroke(object:GeometryObject,center:Point,radius:number):GeometryObject[]{
 if(object.locked||!['stroke','highlight'].includes(object.type))return[object];
 const points=object.points,parts:Point[][]=[];let current:Point[]=[];let changed=false;
 const inside=(p:Point)=>distance(p,center)<radius;
 if(points.length===1)return inside(points[0])?[]:[object];
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,aa=dx*dx+dy*dy,fx=a.x-center.x,fy=a.y-center.y,bb=2*(fx*dx+fy*dy),cc=fx*fx+fy*fy-radius*radius,disc=bb*bb-4*aa*cc;
  const ts=[0,1];if(aa>1e-12&&disc>0){const d=Math.sqrt(disc);for(const t of[(-bb-d)/(2*aa),(-bb+d)/(2*aa)])if(t>1e-8&&t<1-1e-8)ts.push(t);}ts.sort((x,y)=>x-y);
  const at=(t:number):Point=>({...a,x:a.x+dx*t,y:a.y+dy*t,pressure:a.pressure!==undefined&&b.pressure!==undefined?a.pressure+(b.pressure-a.pressure)*t:a.pressure});
  for(let j=0;j<ts.length-1;j++){const lo=ts[j],hi=ts[j+1];if(inside(at((lo+hi)/2))){changed=true;if(current.length>1)parts.push(current);current=[];}else{const start=at(lo),end=at(hi);if(!current.length)current.push(start);current.push(end);}}
 }
 if(current.length>1)parts.push(current);if(!changed)return[object];
 return parts.map((part,index)=>({...object,id:index===0?object.id:crypto.randomUUID(),points:part}));
}
export function touchesStroke(object:GeometryObject,point:Point,radius:number){
 if(object.locked)return false;
 for(let i=0;i<object.points.length;i++){const a=object.points[i],b=object.points[i+1]??a,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));if(distance(point,{x:a.x+dx*t,y:a.y+dy*t})<radius+object.style.width/2)return true;}return false;
}
