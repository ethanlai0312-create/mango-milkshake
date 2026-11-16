import {memo,type ReactNode} from 'react';
import type {GeometryObject,Point} from '../../../shared/geometry';
import {arcPath,atAngle,distance,pressureOutline,smoothPath} from './editor-types';
import {interiorAngles,vertexLabelPositions} from './annotations';

function ObjectView({object:o,selected=false,strict=false,zoom=1,interactive=true}:{object:GeometryObject;selected?:boolean;strict?:boolean;zoom?:number;interactive?:boolean}){
 if(o.visible===false||!o.points.length)return null;
 const [a,b=a,c=b]=o.points,s=o.style,r=o.radius??distance(a,b),center=o.center??a;
 const lineProps={stroke:s.color,strokeWidth:s.width,fill:'none',strokeLinecap:'round' as const,strokeLinejoin:'round' as const,strokeDasharray:s.lineStyle==='dashed'?`${s.width*5} ${s.width*3}`:s.lineStyle==='dotted'?`1 ${s.width*3}`:undefined};
 let node:ReactNode,hit:ReactNode;let bounds:Point[]=[...o.points];
 const line=(p:Point,q:Point)=><line x1={p.x} y1={p.y} x2={q.x} y2={q.y} {...lineProps}/>;
 switch(o.type){
  case 'point':node=<circle cx={a.x} cy={a.y} r={Math.max(2.5,s.width*1.5)} fill={s.color}/>;hit=<circle cx={a.x} cy={a.y} r={9/zoom}/>;break;
  case 'stroke':case 'highlight':{const outline=o.pen==='pencil'||o.pen==='fountain'?pressureOutline(o.points,s.width,o.pen):'';node=outline?<path d={outline} fill={s.color}/>:<path d={smoothPath(o.points)} {...lineProps} strokeLinecap={o.type==='highlight'?'square':'round'}/>;hit=<path d={smoothPath(o.points)} strokeWidth={Math.max(s.width,12/zoom)}/>;break;}
  case 'line':case 'ray':case 'segment':case 'length':{const d=distance(a,b)||1,dx=(b.x-a.x)/d,dy=(b.y-a.y)/d,p=o.type==='line'?{x:a.x-dx*20000,y:a.y-dy*20000}:a,q=['line','ray'].includes(o.type)?{x:b.x+dx*20000,y:b.y+dy*20000}:b;node=line(p,q);hit=<line x1={p.x} y1={p.y} x2={q.x} y2={q.y}/>;break;}
  case 'circle':node=<circle cx={center.x} cy={center.y} r={r} {...lineProps} fill={s.fill??'none'}/>;hit=<circle cx={center.x} cy={center.y} r={r}/>;bounds=[{x:center.x-r,y:center.y-r},{x:center.x+r,y:center.y+r}];break;
  case 'arc':{const d=arcPath(center,r,o.startAngle??0,o.sweep??Math.PI);node=<path d={d} {...lineProps}/>;hit=<path d={d}/>;bounds=[{x:center.x-r,y:center.y-r},{x:center.x+r,y:center.y+r}];break;}
  case 'ellipse':{const rx=o.radiusX??Math.abs(b.x-a.x)/2,ry=o.radiusY??Math.abs(b.y-a.y)/2,p=o.center??{x:(a.x+b.x)/2,y:(a.y+b.y)/2};node=<ellipse cx={p.x} cy={p.y} rx={rx} ry={ry} transform={`rotate(${(o.rotation??0)*180/Math.PI} ${p.x} ${p.y})`} {...lineProps} fill={s.fill??'none'}/>;hit=<ellipse cx={p.x} cy={p.y} rx={rx} ry={ry}/>;bounds=[{x:p.x-rx,y:p.y-ry},{x:p.x+rx,y:p.y+ry}];break;}
  case 'text':node=<text x={a.x} y={a.y} fill={s.color} fontSize={Math.max(14,s.width*6)}>{o.text}</text>;hit=<rect x={a.x-4} y={a.y-17} width={Math.max(30,(o.text?.length??0)*15)} height={24}/>;break;
  case 'angle':{const start=Math.atan2(a.y-b.y,a.x-b.x),end=Math.atan2(c.y-b.y,c.x-b.x),sweep=((end-start+Math.PI*3)%(Math.PI*2))-Math.PI;node=<>{line(a,b)}{line(b,c)}<path d={arcPath(b,Math.min(30,distance(a,b)/2,distance(c,b)/2),start,sweep)} {...lineProps}/>{!strict&&o.showMeasurements&&<text x={b.x+26*Math.cos(start+sweep/2)} y={b.y+26*Math.sin(start+sweep/2)-8} className="geo-measure">{(Math.abs(sweep)*180/Math.PI).toFixed(1)}°</text>}</>;hit=<polyline points={o.points.map(p=>`${p.x},${p.y}`).join(' ')}/>;break;}
  default:node=<polygon points={o.points.map(p=>`${p.x},${p.y}`).join(' ')} {...lineProps} fill={s.fill??'none'}/>;hit=<polygon points={o.points.map(p=>`${p.x},${p.y}`).join(' ')}/>;
 }
 const xs=bounds.map(p=>p.x),ys=bounds.map(p=>p.y),margin=7/zoom,angles=!strict&&o.showMeasurements&&!['stroke','highlight','line','ray','segment','circle','arc','ellipse','text','point'].includes(o.type)?interiorAngles(o.points):[],labelPositions=o.showLabels&&o.labels?.length?vertexLabelPositions(o.points,o.labels,zoom):[];
 return <g data-shape={o.id} data-object-type={o.type} data-layer={o.layer} data-locked={o.locked||undefined} opacity={s.opacity}>
  {node}
  {!strict&&o.showMeasurements&&['segment','length','circle','arc'].includes(o.type)&&<text x={o.type==='circle'||o.type==='arc'?center.x+r+8:(a.x+b.x)/2+8} y={o.type==='circle'||o.type==='arc'?center.y-8:(a.y+b.y)/2-10} className="geo-measure">{o.type==='circle'||o.type==='arc'?`r = ${(r/40).toFixed(2)}`:`${(distance(a,b)/40).toFixed(2)} 单位`}{o.type==='arc'?` · ${(Math.abs(o.sweep??0)*180/Math.PI).toFixed(1)}°`:''}</text>}
  {!strict&&o.showMeasurements&&o.points.length>=3&&['triangle','isoscelesTriangle','equilateralTriangle','rightTriangle','polygon','rectangle','square','parallelogram','rhombus','trapezoid'].includes(o.type)&&o.points.map((vertex,i,all)=>{const centerPoint={x:all.reduce((sum,p)=>sum+p.x,0)/all.length,y:all.reduce((sum,p)=>sum+p.y,0)/all.length},dir=Math.atan2(centerPoint.y-vertex.y,centerPoint.x-vertex.x),p=atAngle(vertex,27,dir);return <text key={i} x={p.x} y={p.y} className="geo-measure" textAnchor="middle">{(angles[i]*180/Math.PI).toFixed(1)}°</text>;})}
  {o.showLabels&&o.labels?.map((label,i)=>labelPositions[i]&&<text key={i} x={labelPositions[i]!.x} y={labelPositions[i]!.y} textAnchor="middle" className="geo-point-label">{label}</text>)}
  {interactive&&<g className="geo-object-hit" stroke="transparent" fill="none" strokeWidth={12/zoom} pointerEvents="stroke">{hit}</g>}
  {selected&&<g className="geo-selection" opacity={1}><rect x={Math.min(...xs)-margin} y={Math.min(...ys)-margin} width={Math.max(...xs)-Math.min(...xs)+margin*2} height={Math.max(...ys)-Math.min(...ys)+margin*2} rx={3/zoom} fill="none" stroke="#0067d5" strokeWidth={1/zoom} strokeDasharray={`${4/zoom} ${3/zoom}`}/>{o.points.map((p,i)=><circle key={i} data-geo-vertex={i} cx={p.x} cy={p.y} r={5/zoom} fill="white" stroke="#0067d5" strokeWidth={1/zoom}/>)}</g>}
 </g>;
}
export const ObjectRenderer=memo(ObjectView);
