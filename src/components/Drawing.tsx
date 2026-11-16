import {useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {Button} from '../ui/Button';
import {ObjectRenderer} from './geometry/ObjectRenderer';
import {Instruments} from './geometry/Instruments';
import {ReplayPanel,ToolPanel} from './geometry/ToolPanel';
import {TOOL_LABELS,isPen,type DrawingProps} from './geometry/editor-types';
import {useGeometryEditor} from './geometry/useGeometryEditor';
import {useGeometryGestures} from './geometry/useGeometryGestures';
import './geometry/geometry.css';

export type {DrawingProps} from './geometry/editor-types';

/** The same editor serves authoring, student answers, teacher review and structured replay. */
export function Drawing(props:DrawingProps){
 const editor=useGeometryEditor(props),svg=useRef<SVGSVGElement>(null),gestures=useGeometryGestures(editor,svg),id=useId().replace(/:/g,'');
 const [screenScale,setScreenScale]=useState(1);
 const [inputModality,setInputModality]=useState<'keyboard'|'pointer'>('keyboard');
 const [objectsExpanded,setObjectsExpanded]=useState(false);
 useLayoutEffect(()=>{const node=svg.current;if(!node)return;const measure=()=>{const m=node.getScreenCTM();if(m)setScreenScale(Math.hypot(m.a,m.b));};measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[]);
 const strict=editor.mode==='strict',view=editor.view;
 const source=gestures.isErasing?editor.draft:editor.preview.objects;
 const objects=source.filter(o=>(o.layer!=='handwriting'||editor.layers.handwriting)&&(o.layer!=='highlight'||editor.layers.highlight)&&(!o.auxiliary||editor.layers.auxiliary)&&o.id!==gestures.movingObjectId);
 const ordered=[...objects.filter(o=>o.layer==='highlight'),...objects.filter(o=>o.layer==='initial'),...objects.filter(o=>o.layer!=='highlight'&&o.layer!=='initial')];
 const recordedPen=editor.replayCount!==null||props.readOnly?editor.activeState.pen?.position:null;
 const penPosition=recordedPen??(editor.canEdit&&!gestures.activeInstrument?gestures.cursor:null);
 const exportSvg=()=>{
  if(!svg.current)return;const clone=svg.current.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-layer="tools"],[data-layer="temporary"],.geo-selection,.geo-object-hit').forEach(node=>node.remove());clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.removeAttribute('tabindex');
  const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent='.geo-measure,.geo-point-label{font:12px system-ui,sans-serif;fill:#405568;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}.geo-point-label{font-size:14px;font-weight:600}';clone.prepend(style);
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='geometry.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const help=strict?'严格尺规：直尺连接两个已有点或合法交点；圆规可抬笔旋转定位，落笔后再画弧；已放置的尺与圆规可同时保留。':isPen(editor.tool)?'拖动连续书写。笔尖与落点重合，完成后的笔迹独立保存样式。':editor.tool==='compass'?'抬笔旋转定位，落笔旋转画弧。选择其他工具后圆规仍留在画板。':editor.tool==='eraser'?'局部擦除保留笔迹其余部分；也可切换整笔或对象擦除。题目给定图形始终保留。':editor.tool==='polygon'?'逐个点击顶点，完成后点“完成多边形”，也可以按 Enter。':editor.tool==='select'?'点击选择对象，拖动移动；顶点手柄保持受约束图形性质。Shift 可多选。':editor.tool==='protractor'?'移动中心和旋转零线；拖动绘制相对零线的角，或输入指定角度。':'拖动绘制；实体尺可移动、旋转，并沿真实边缘画线。';
 return <section className={`drawing geometry-editor ${strict?'is-strict':''} ${editor.canEdit?'is-editing':'is-reviewing'}`} data-drawing-mode={editor.mode} data-input-modality={inputModality} onPointerDownCapture={()=>setInputModality('pointer')} onKeyDownCapture={()=>setInputModality('keyboard')} aria-label={props.authoring?'题目初始图形编辑器':'几何作图编辑器'}>
  <header className="geo-heading"><div><strong>{props.authoring?'预设几何条件':strict?'严格尺规作图':'几何画板'}</strong><span>{props.authoring?'给学生显示的已知图形':strict?'无刻度直尺与圆规':'书写、测量与精确作图'}</span></div><span className="geo-mode-badge">{props.readOnly?'查看与回放':strict?'模式已锁定':'自由模式'}</span></header>
  <ToolPanel editor={editor} gestures={gestures} onExport={exportSvg}/>
  <div className="geo-canvas-shell">
   <svg ref={svg} viewBox="0 0 800 500" style={{'--geo-screen-scale':screenScale*view.zoom} as CSSProperties} className={`drawing-canvas geo-canvas ${isPen(editor.tool)||editor.tool==='eraser'?'has-pen':''}`} role="img" aria-label="几何绘图区" aria-describedby={`${id}-help`} tabIndex={0} onPointerDown={gestures.pointerDown} onPointerMove={gestures.pointerMove} onPointerUp={gestures.pointerUp} onPointerCancel={gestures.pointerCancel} onPointerLeave={gestures.pointerLeave} onKeyDown={gestures.keyDown} onKeyUp={gestures.keyUp} onContextMenu={event=>event.preventDefault()}>
    <defs><pattern id={`${id}-grid`} width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 H 0 V 10" fill="none" stroke="#dce5eb" strokeWidth=".5"/></pattern></defs>
    <rect width="800" height="500" fill="#fff"/>
    <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`} data-viewport="true">
     {!strict&&editor.grid&&view.zoom*screenScale>=.4&&<rect x={(-view.x-800)/view.zoom} y={(-view.y-500)/view.zoom} width={2400/view.zoom} height={1500/view.zoom} fill={`url(#${id}-grid)`} pointerEvents="none"/>}
     {ordered.map(object=><ObjectRenderer key={object.id} object={object} selected={editor.selectedIds.includes(object.id)} strict={strict||(object.layer==='initial'&&!props.authoring)} zoom={view.zoom} interactive={editor.canEdit}/>)}
     {!gestures.isErasing&&editor.draft.map(object=><g key={object.id} data-layer="temporary" pointerEvents="none"><ObjectRenderer object={object} strict={strict} zoom={view.zoom} interactive={false}/></g>)}
     {editor.layers.tools&&<Instruments tool={editor.visibleTool} state={editor.activeState} strict={strict} penPosition={penPosition} color={editor.style.color} zoom={view.zoom} readOnly={!editor.canEdit}/>}
     {gestures.pending.map((point,index)=><circle key={index} data-layer="temporary" cx={point.point.x} cy={point.point.y} r={4/view.zoom} fill="#0067d5" pointerEvents="none"/>)}
     {editor.canEdit&&editor.tool==='eraser'&&gestures.cursor&&<circle data-layer="temporary" cx={gestures.cursor.x} cy={gestures.cursor.y} r={12/view.zoom} fill="#fff" fillOpacity=".4" stroke="#8e5363" strokeWidth={1/view.zoom} pointerEvents="none"/>}
    </g>
   </svg>
   {editor.preview.objects.every(o=>o.layer==='initial')&&editor.canEdit&&<div className="geo-empty-hint" aria-hidden="true">{strict?'选择直尺或圆规，开始保留作图过程':isPen(editor.tool)?'从这里落笔':'拖动绘制你的第一个图形'}</div>}
  </div>
  <div className="geo-status"><small id={`${id}-help`}>{editor.message||help}</small><small>{Math.round(view.zoom*100)}% · {editor.canEdit?'双指平移与缩放 · 滚轮缩放':'拖动画布平移 · 滚轮缩放'}</small></div>
  <ReplayPanel editor={editor}/>
  <details className="geo-object-list" open={objectsExpanded} onToggle={event=>setObjectsExpanded(event.currentTarget.open)}><summary>对象与图层 · {editor.document.objects.length} 个对象</summary>{objectsExpanded&&<div>{editor.document.objects.map((object,index)=><Button key={object.id} disabled={object.locked||!editor.canEdit} aria-pressed={editor.selectedIds.includes(object.id)} onClick={()=>{editor.chooseTool('select');editor.setSelectedIds([object.id]);}}>{object.locked?'🔒 ':''}{TOOL_LABELS[object.pen??object.type]??object.type} {index+1}{object.visible===false?' · 已隐藏':''}</Button>)}{editor.canEdit&&<Button className="geo-clear" onClick={editor.clear}>清空本人作图</Button>}</div>}</details>
  <details className="compact-help geo-help"><summary>操作说明</summary><p>{help} 题目给定图形不能移动、擦除或修改。画布平移、缩放不会改变实际数学尺寸。</p>{!strict&&<p>每条笔迹的颜色、线宽、透明度独立保存。荧光笔默认透明叠加；选择已有笔迹后，属性面板只修改选中的对象。</p>}<p>快捷键：选择后按 Delete 删除，Ctrl+Z 撤销，Ctrl+Shift+Z 重做，空格配合拖动平移，Esc 取消当前操作。</p></details>
 </section>;
}
