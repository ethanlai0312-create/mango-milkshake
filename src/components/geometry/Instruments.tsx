import {createContext,useContext} from 'react';
import type {Point,ToolState} from '../../../shared/geometry';
import {COMPASS_LEG_LENGTH,add,atAngle,isPen,type EditorTool} from './editor-types';
import {instrumentPose,placedInstruments} from './instrument-state';

const degrees=(v:number)=>v*180/Math.PI;
const InstrumentReadOnly=createContext(false);
function Handle({x,y,name,label,kind='move',radius=10}:{x:number;y:number;name:string;label:string;kind?:string;radius?:number}){
 const readOnly=useContext(InstrumentReadOnly);
 return <g data-geo-handle={name} className={`geo-handle geo-handle-${kind}`} role={readOnly?undefined:'button'} tabIndex={readOnly?undefined:0} aria-label={label}>
  <circle className="geo-handle-hit" cx={x} cy={y} r={radius+7} fill="transparent"/>
 </g>;
}

function Straightedge({state,tool,strict}:{state:ToolState;tool:string;strict:boolean}){
 const pose=instrumentPose(state,tool);if(!pose)return null;const l=pose.length??(tool==='ruler'?300:220),triangle=tool!=='ruler',height=triangle?(tool==='setSquare30'?l/Math.sqrt(3):l):44;
 return <g className="geo-instrument geo-straightedge" data-instrument={tool} transform={`translate(${pose.origin.x} ${pose.origin.y}) rotate(${degrees(pose.angle)})`}>
  {triangle?<path data-geo-handle="instrument-move" d={`M 0 0 L ${l} 0 L 0 ${-height} Z M 26 -26 L 26 ${-height+60} L ${l-70} -26 Z`} fillRule="evenodd" className="geo-instrument-body"/>:<rect data-geo-handle="instrument-move" x="-9" y="0" width={l+18} height="44" rx="5" className="geo-instrument-body"/>}
  {!strict&&!triangle&&Array.from({length:Math.floor(l/4)+1},(_,i)=><g key={i} pointerEvents="none"><path d={`M ${i*4} 0 v ${i%10===0?16:i%5===0?11:6}`} stroke="#6b7d8f" strokeWidth=".7"/>{i%10===0&&<text x={i*4} y="30" textAnchor="middle" fontSize="9" fill="#44546a">{i/10}</text>}</g>)}
  {triangle&&<g pointerEvents="none" fill="#526777" fontSize="12"><text x="12" y="-12">90°</text><text x={l-54} y="-10">{tool==='setSquare30'?'30°':'45°'}</text><text x="10" y={-height+36}>{tool==='setSquare30'?'60°':'45°'}</text></g>}
  <g className="geo-edge-targets" stroke="transparent" strokeWidth="16" fill="none"><path data-geo-edge="0" d={`M 0 0 H ${l}`}/>{triangle&&<><path data-geo-edge="1" d={`M ${l} 0 L 0 ${-height}`}/><path data-geo-edge="2" d={`M 0 ${-height} V 0`}/></>}</g>
  <path d={`M 0 0 H ${l}`} stroke="#40627e" strokeWidth="1.3" pointerEvents="none"/>
  <Handle x={triangle?l*.28:l*.45} y={triangle?-height*.25:28} name="instrument-move" label={triangle?'移动三角尺':'移动直尺'}/>
  <Handle x={l+24} y={triangle?-12:22} name="instrument-rotate" label={triangle?'旋转三角尺':'旋转直尺'} kind="rotate"/>
 </g>;
}

function Protractor({state}:{state:ToolState}){
 const pose=state.protractor;if(!pose)return null;const r=pose.length??150;
 return <g className="geo-instrument geo-protractor" data-instrument="protractor" transform={`translate(${pose.origin.x} ${pose.origin.y}) rotate(${degrees(pose.angle)})`}>
  <path d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 Z M ${-r+30} -12 A ${r-30} ${r-30} 0 0 1 ${r-30} -12 Z`} fillRule="evenodd" data-geo-handle="instrument-move" className="geo-instrument-body"/>
  <g pointerEvents="none">{Array.from({length:181},(_,i)=>{const angle=-i*Math.PI/180,outer=atAngle({x:0,y:0},r,angle),inner=atAngle({x:0,y:0},r-(i%10===0?18:i%5===0?11:5),angle),label=atAngle({x:0,y:0},r-31,angle);return <g key={i}><line x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke="#617a8d" strokeWidth={i%10===0?1:.5}/>{i%10===0&&<text x={label.x} y={label.y+3} textAnchor="middle" fontSize="9" fill="#3d5669">{i}</text>}</g>;})}<path d={`M ${-r-8} 0 H ${r+8} M 0 -10 V 10 M -10 0 H 10`} stroke="#315a7a" strokeWidth="1" fill="none"/><circle r="3" fill="#0067d5"/></g>
  <path d={`M 0 0 H ${r}`} data-geo-edge="0" stroke="transparent" strokeWidth="16"/>
  <Handle x={0} y={22} name="instrument-move" label="移动量角器中心"/>
  <Handle x={r+22} y={0} name="instrument-rotate" label="旋转量角器零度基线" kind="rotate"/>
 </g>;
}

function Compass({state,strict}:{state:ToolState;strict:boolean}){
 const pose=state.compass;if(!pose)return null;const r=pose.radius,hinge={x:r/2,y:Math.sqrt(Math.max(0,COMPASS_LEG_LENGTH*COMPASS_LEG_LENGTH-r*r/4))},opening={x:r*.77,y:hinge.y*.46},rotation={x:r,y:0},body=add(hinge,{x:0,y:13});
 return <g className={`geo-instrument geo-compass ${pose.phase==='drawing'?'is-drawing':''}`} data-instrument="compass" data-radius={strict?undefined:r} data-phase={pose.phase} data-pen-down={!!pose.penDown} transform={`translate(${pose.center.x} ${pose.center.y}) rotate(${degrees(pose.angle)})`}>
  <g data-geo-handle="compass-move" className="geo-compass-body"><path d={`M 0 16 L ${hinge.x} ${hinge.y} L ${r} 21`} fill="none" stroke="#3e5a70" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/><path d={`M 0 16 L ${hinge.x} ${hinge.y} L ${r} 21`} fill="none" stroke="#e1e9ef" strokeWidth="5.5" strokeLinecap="round"/><path d={`M ${hinge.x} ${hinge.y-8} v 24`} stroke="#39516c" strokeWidth="15" strokeLinecap="round"/><circle cx={hinge.x} cy={hinge.y} r="9" fill="#d2dde6" stroke="#4a6277" strokeWidth="1.5"/></g>
  <path data-compass-tip="needle" d="M -3 16 L 0 0 L 3 16 Z" fill="#334b5c" stroke="#172b3a" strokeWidth=".7" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
  <g data-compass-tip="pencil" pointerEvents="none"><path d={`M ${r-5} 22 L ${r} 0 L ${r+5} 22 Z`} fill="#dbbd8b" stroke="#6e5940" strokeWidth=".6" vectorEffect="non-scaling-stroke"/><path d={`M ${r-1.8} 7 L ${r} 0 L ${r+1.8} 7 Z`} fill="#152331" stroke="#152331" strokeWidth=".7" vectorEffect="non-scaling-stroke"/></g>
  <path data-geo-handle="compass-rotate" d={`M ${hinge.x+(r-hinge.x)*.45} ${hinge.y*.55} L ${r} 0`} stroke="transparent" strokeWidth="22" fill="none" pointerEvents="stroke"/>
  <rect x={opening.x-7} y={opening.y-4} width="14" height="8" rx="2" fill="#bdab77" stroke="#7d7152" strokeWidth=".7" pointerEvents="none"/>
  <Handle x={body.x} y={body.y} name="compass-move" label="移动整把圆规，保持开口"/>
  {pose.phase!=='drawing'&&<Handle x={opening.x} y={opening.y} name="compass-opening" label="专用开口调节手柄" kind="opening"/>}
  <Handle x={rotation.x} y={rotation.y} name="compass-rotate" label={pose.penDown?'固定圆心和半径，旋转圆规画弧':'抬笔旋转圆规，不画线'} kind="rotate" radius={11}/>
  <Handle x={0} y={0} name="compass-center" label="放置圆规中心针脚"/>
 </g>;
}

export function PenBody({tool,position,color,zoom=1}:{tool:EditorTool;position:Point;color:string;zoom?:number}){
 if(!isPen(tool)&&tool!=='eraser')return null;
 return <g className="geo-pen-body" data-pen={tool} transform={`translate(${position.x} ${position.y}) scale(${1/zoom}) rotate(-36)`} pointerEvents="none" aria-hidden="true">
  {tool==='eraser'?<g transform="translate(-13 -15)"><rect width="27" height="38" rx="5" fill="#e6b1b8" stroke="#85575f"/><path d="M 0 22 H 27 V 33 Q 27 38 22 38 H 5 Q 0 38 0 33 Z" fill="#d6dce5" stroke="#707d8a"/></g>:tool==='pencil'?<><path d="M 0 0 L -6 -17 H 6 Z" fill="#dec39b" stroke="#72604c"/><path d="M 0 0 L -2.2 -6 H 2.2 Z" fill="#41434a"/><path d="M -6 -17 V -85 H 6 V -17" fill="#e4ac50" stroke="#7b623c"/><path d="M 0 -20 V -85" stroke="#f5d48b"/><path d="M -6 -85 V -94 Q 0 -99 6 -94 V -85" fill="#ca9399" stroke="#7e6164"/></>:tool==='highlighter'?<><path d="M -7 0 L -9 -12 L 7 -16 L 9 -4 Z" fill={color} stroke="#6b694d"/><rect x="-11" y="-80" width="22" height="65" rx="5" fill={color} fillOpacity=".5" stroke="#7f8666"/><path d="M -11 -62 H 11 M -11 -20 H 11" stroke="#87916f"/><rect x="-11" y="-94" width="22" height="17" rx="5" fill="#dee2e0" stroke="#86928b"/></>:tool==='fountain'?<><path d="M 0 0 L -7 -19 L 0 -30 L 7 -19 Z" fill="#e0c27e" stroke="#8c703f"/><path d="M 0 0 V -21" stroke="#6d5b3c"/><circle cy="-20" r="1.5" fill="#6d5b3c"/><rect x="-6" y="-86" width="12" height="57" rx="4" fill={color} stroke="#192c3d"/><path d="M -6 -35 H 6 M -6 -80 H 6" stroke="#d6bd82" strokeWidth="3"/><path d="M 3 -84 V -62" stroke="#b89e64" strokeWidth="2"/></>:<><path d="M 0 0 L -4 -12 H 4 Z" fill="#a6b2bd" stroke="#566b7a"/><circle r="1.3" fill={color}/><rect x="-5" y="-80" width="10" height="68" rx="4" fill="#e1e9ee" stroke="#6e8394"/><path d="M -3 -15 V -40 M 3 -15 V -40" stroke={color} strokeWidth="2"/><path d="M -5 -79 H 5 M 3 -80 V -57" stroke={color} strokeWidth="2.5"/><path d="M 0 -80 V -87" stroke="#607789" strokeWidth="4"/></>}
  <circle r="1.4" fill={color}/>
 </g>;
}

export function Instruments({tool,state,strict,penPosition,color,zoom,readOnly=false}:{tool:EditorTool;state:ToolState;strict:boolean;penPosition:Point|null;color:string;zoom:number;readOnly?:boolean}){
 return <InstrumentReadOnly.Provider value={readOnly}><g data-layer="tools" className={readOnly?'geo-tools-readonly':''}>
  {placedInstruments(state,strict?'strict':'free').map(id=>id==='compass'?<Compass key={id} state={state} strict={strict}/>:id==='protractor'?<Protractor key={id} state={state}/>:<Straightedge key={id} state={state} tool={id} strict={strict}/>)}
  {penPosition&&!strict&&<PenBody tool={tool} position={penPosition} color={color} zoom={zoom}/>}
 </g></InstrumentReadOnly.Provider>;
}
