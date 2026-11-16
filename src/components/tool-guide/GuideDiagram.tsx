import {useId} from 'react';
import type {GuideTopic} from './topics';

/** Static operation map, shown only in the tutorial; nothing is overlaid on the actual board. */
export function GuideDiagram({kind}:{kind:NonNullable<GuideTopic['diagram']>}){
 const title=useId();
 return <figure className="guide-diagram"><svg viewBox="0 0 420 235" role="img" aria-labelledby={title}>
  <title id={title}>{kind==='compass'?'圆规针脚、笔脚、开口调节和整体移动位置':kind==='protractor'?'量角器中心与零线右端的操作位置':'尺身移动、右端外侧旋转与沿边画线的位置'}</title>
  {kind==='compass'?<>
   <path d="M 116 177 L 180 55 L 280 176" fill="none" stroke="#486579" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/><path d="M 116 177 L 180 55 L 280 176" fill="none" stroke="#dbe7ed" strokeWidth="5"/>
   <path d="M 113 177 L 116 193 L 119 177 Z" className="guide-map-tip"/><path d="M 275 176 L 280 193 L 285 176 Z" fill="#d5b47b" stroke="#725a35"/><path d="M 278.5 188 L 280 193 L 281.5 188 Z" className="guide-map-tip"/>
   <path d="M 180 48 V 38" stroke="#486579" strokeWidth="14" strokeLinecap="round"/><circle cx="180" cy="55" r="8" fill="#dbe7ed" stroke="#486579"/><rect x="221" y="113" width="13" height="8" rx="2" fill="#bca76d" stroke="#7c6b43"/>
   <g className="guide-map-zone"><circle cx="180" cy="40" r="14"/><circle cx="227" cy="117" r="13"/><circle cx="116" cy="193" r="13"/><circle cx="280" cy="193" r="13"/></g>
   <g className="guide-map-line"><path d="M 180 26 V 19 M 241 117 H 279 M 102 193 H 62 M 294 193 H 335"/></g>
   <g className="guide-map-label"><text x="180" y="13" textAnchor="middle">顶部：整体移动</text><text x="286" y="121">调节钮：改开口</text><text x="12" y="218">针脚：定圆心</text><text x="280" y="218">笔脚：旋转</text></g>
  </>:kind==='protractor'?<>
   <path d="M 95 166 A 115 115 0 0 1 325 166 L 297 166 A 87 87 0 0 0 123 166 Z" className="guide-map-tool"/>
   <g stroke="#648295" strokeWidth="1">{[0,15,30,45,60,75,90,105,120,135,150,165,180].map(degree=>{const a=degree*Math.PI/180;return <path key={degree} d={`M ${210+115*Math.cos(a)} ${166-115*Math.sin(a)} L ${210+100*Math.cos(a)} ${166-100*Math.sin(a)}`}/>;})}<path d="M 86 166 H 345 M 210 158 V 174"/></g>
   <g className="guide-map-label"><text x="210" y="43" textAnchor="middle">90°</text><text x="310" y="154">0°</text><text x="210" y="221" textAnchor="middle">中心下方：移动到顶点</text><text x="281" y="94">右端外侧：旋转</text></g>
   <g className="guide-map-zone"><circle cx="210" cy="188" r="13"/><circle cx="346" cy="166" r="13"/></g><g className="guide-map-line"><path d="M 210 201 V 207 M 346 151 V 104"/></g>
  </>:<>
   {kind==='ruler'?<><rect x="62" y="106" width="264" height="42" rx="5" className="guide-map-tool"/><g stroke="#648295" strokeWidth="1">{Array.from({length:27},(_,i)=><path key={i} d={`M ${68+i*9.6} 106 v ${i%5?7:14}`}/>)}</g></>:<path d={kind==='setSquare30'?'M 75 174 H 326 L 75 29 Z M 100 149 V 74 L 270 149 Z':'M 112 174 H 326 L 112 30 Z M 138 149 V 78 L 275 149 Z'} fillRule="evenodd" className="guide-map-tool"/>}
   <g className="guide-map-zone"><circle cx="195" cy={kind==='ruler'?130:140} r="14"/><circle cx="350" cy={kind==='ruler'?128:162} r="14"/></g>
   <g className="guide-map-line"><path d={kind==='ruler'?'M 195 115 V 65 M 350 112 V 64 M 90 190 H 300':'M 195 124 V 86 M 350 146 V 64 M 90 198 H 300'}/></g>
   <g className="guide-map-label"><text x="195" y={kind==='ruler'?55:76} textAnchor="middle">尺身：移动</text><text x="350" y="51" textAnchor="middle">右端外侧：旋转</text><text x="195" y="224" textAnchor="middle">沿尺边拖动：画线</text></g>
  </>}
 </svg><figcaption>操作位置示意 · 蓝圈只在教程中显示</figcaption></figure>;
}
