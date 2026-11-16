import {useMemo,useState} from 'react';
import {Circle,Compass,Download,Eraser,Hand,Highlighter,MousePointer2,Pen,PenLine,Pencil,Redo2,Ruler,Shapes,Trash2,Triangle,Undo2,ZoomIn,ZoomOut} from 'lucide-react';
import {canRedo,canUndo,createQuickShape,type GeometryObject,type InstrumentKind} from '../../../shared/geometry';
import {Button} from '../../ui/Button';
import {COMPASS_LEG_LENGTH,COMPASS_MAX_RADIUS,SHAPE_TOOLS,TOOL_LABELS,atAngle,distance,isInstrument,isPen,type EditorTool} from './editor-types';
import {placedInstruments} from './instrument-state';
import type {GeometryEditor} from './useGeometryEditor';
import type {GeometryGestures} from './useGeometryGestures';

const ICONS:Record<string,typeof Pen>={ballpoint:PenLine,highlighter:Highlighter,pencil:Pencil,fountain:Pen,eraser:Eraser,ruler:Ruler,setSquare45:Triangle,setSquare30:Triangle,protractor:Circle,compass:Compass,select:MousePointer2,pan:Hand};
function ToolButton({tool,editor,label}:{tool:EditorTool;editor:GeometryEditor;label?:string}){const Icon=ICONS[tool]??Shapes,placed=placedInstruments(editor.toolState,editor.mode).includes(tool as InstrumentKind);return <Button className={`geo-tool-button ${editor.tool===tool?'is-active':''} ${placed?'is-placed':''}`} aria-label={label??TOOL_LABELS[tool]} aria-description={placed?'已放在画板上，选择其他工具后仍保留':undefined} aria-pressed={isInstrument(tool)?placed:editor.tool===tool} onClick={()=>editor.chooseTool(tool)}><Icon size={19} strokeWidth={1.7}/><span>{label??TOOL_LABELS[tool]}</span></Button>;}
function number(value:string,fallback:number,min:number,max:number){const parsed=Number(value);return Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):fallback;}

export function ToolPanel({editor:ed,gestures,onExport}:{editor:GeometryEditor;gestures:GeometryGestures;onExport:()=>void}){
 const [angle,setAngle]=useState(45),[exact,setExact]=useState(''),[shapeSize,setShapeSize]=useState({width:'4',height:'3'});
 const [expanded,setExpanded]=useState(()=>window.innerWidth>700);
 const canBack=useMemo(()=>canUndo(ed.document),[ed.document]),canForward=useMemo(()=>canRedo(ed.document),[ed.document]);
 const selected=ed.selected[0],style=selected?.style??ed.style,strict=ed.mode==='strict',compass=ed.toolState.compass!;
 const editNumeric=()=>{
  if(!selected||strict)return;const n=Number(exact);if(!Number.isFinite(n)||n<=0){ed.setMessage('请输入大于零的有效数值');return;}if(selected.type==='angle'&&n>180){ed.setMessage('指定角度应在 0.1° 至 180.0° 之间');return;}const p=selected.points,a=p[0],b=p[1]??a;let next:GeometryObject={...selected};
  if(['circle','arc'].includes(selected.type)){next={...next,radius:n*40,points:[selected.center??a,atAngle(selected.center??a,n*40,selected.startAngle??0)]};}
  else if(['segment','length','line','ray'].includes(selected.type)){const angle=Math.atan2(b.y-a.y,b.x-a.x);next.points=[a,atAngle(a,n*40,angle)];}
  else if(selected.type==='angle'&&p.length===3){const base=Math.atan2(p[0].y-p[1].y,p[0].x-p[1].x);next.points=[p[0],p[1],atAngle(p[1],distance(p[1],p[2]),base-n*Math.PI/180)];}
  else return;ed.replaceObjects([next],'select',{gesture:'move'});
 };
 const resizeShape=()=>{if(!selected||strict)return;const width=Number(shapeSize.width)*40,height=Number(shapeSize.height)*40;if(width<=0||height<=0||!Number.isFinite(width+height))return;const a=selected.points[0];ed.replaceObjects([createQuickShape(selected.type,a,{x:a.x+width,y:a.y+height},{id:selected.id,style:selected.style,labels:selected.labels,showLabels:selected.showLabels,showMeasurements:selected.showMeasurements})],'select',{gesture:'move'});};
 return <>
  {ed.canEdit&&<div className="geo-toolstrip" role="toolbar" aria-label="作图工具">
   <div className="geo-tool-group"><ToolButton tool="select" editor={ed}/><ToolButton tool="pan" editor={ed}/></div>
   {!strict&&<div className="geo-tool-group">{(['ballpoint','highlighter','pencil','fountain','eraser'] as EditorTool[]).map(tool=><ToolButton key={tool} tool={tool} editor={ed}/>)}</div>}
   <div className="geo-tool-group"><ToolButton tool="ruler" editor={ed} label={strict?'无刻度直尺':'直尺'}/><ToolButton tool="compass" editor={ed}/>{!strict&&<><ToolButton tool="setSquare45" editor={ed}/><ToolButton tool="setSquare30" editor={ed}/><ToolButton tool="protractor" editor={ed}/></>}</div>
   {!strict&&<label className="geo-shape-picker"><Shapes size={18}/><span>快捷图形</span><select aria-label="快捷图形" value={SHAPE_TOOLS.includes(ed.tool as typeof SHAPE_TOOLS[number])?ed.tool:''} onChange={event=>ed.chooseTool(event.target.value as EditorTool)}><option value="" disabled>选择图形</option>{SHAPE_TOOLS.map(tool=><option value={tool} key={tool}>{TOOL_LABELS[tool]}</option>)}</select></label>}
  </div>}
  {ed.canEdit&&ed.tool==='compass'&&<div className="geo-compass-controls" role="group" aria-label="圆规笔尖状态"><span>圆规</span><Button className={!compass.penDown?'is-active':''} aria-pressed={!compass.penDown} onClick={()=>ed.setCompassPenDown(false)}>抬笔</Button><Button className={compass.penDown?'is-active':''} aria-pressed={!!compass.penDown} onClick={()=>ed.setCompassPenDown(true)}>落笔</Button><small>{compass.penDown?'旋转画弧':'旋转只定位'}</small></div>}
  <details className="geo-properties" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>工具与对象属性</summary><div className="geo-options" role="group" aria-label="当前工具与对象属性">
   {ed.canEdit&&<>
    <span className="geo-property-target">{selected?`已选 ${ed.selected.length} 个对象`:`${TOOL_LABELS[ed.tool]} · 默认样式`}</span>
    <label className="geo-color-control">颜色<input type="color" aria-label={selected?'选中对象颜色':'当前工具颜色'} value={style.color} onChange={event=>ed.setStyle({color:event.target.value})}/></label>
    {strict?<label>线条<select aria-label="线条粗细" value={style.width<=1.5?'1':style.width>=3?'3':'2'} onChange={event=>ed.setStyle({width:Number(event.target.value)})}><option value="1">细</option><option value="2">常规</option><option value="3">粗</option></select></label>:<>
     <label>线宽<input aria-label={selected?'选中对象线宽':'当前工具线宽'} type="number" min=".5" max="40" step=".2" value={style.width} onChange={event=>ed.setStyle({width:number(event.target.value,style.width,.5,40)})}/></label>
     <label>不透明度<input aria-label={selected?'选中对象不透明度':'当前工具不透明度'} type="range" min={selected?.pen==='highlighter'||ed.tool==='highlighter'?15:5} max={selected?.pen==='highlighter'||ed.tool==='highlighter'?45:100} value={Math.round(style.opacity*100)} onChange={event=>ed.setStyle({opacity:Number(event.target.value)/100})}/><output>{Math.round(style.opacity*100)}%</output></label>
    </>}
    <label>线型<select aria-label="线型" value={style.lineStyle} onChange={event=>ed.setStyle({lineStyle:event.target.value as typeof style.lineStyle})}><option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option></select></label>
    {ed.tool==='eraser'&&<label>擦除方式<select aria-label="擦除方式" value={ed.eraserMode} onChange={event=>ed.setEraserMode(event.target.value as typeof ed.eraserMode)}><option value="partial">局部擦笔迹</option><option value="stroke">整条笔迹</option><option value="object">独立几何对象</option></select></label>}
    {['ruler','setSquare45','setSquare30'].includes(ed.tool)&&<label>沿边绘制<select aria-label="尺边绘制类型" value={ed.rulerType} onChange={event=>ed.setRulerType(event.target.value as typeof ed.rulerType)}><option value="segment">线段</option><option value="ray">射线</option><option value="line">直线</option></select></label>}
    {ed.tool==='compass'&&<Button className={gestures.transfer?'is-active':''} aria-pressed={gestures.transfer} onClick={gestures.toggleTransfer}>取已有长度</Button>}
    {isInstrument(ed.tool)&&<Button onClick={ed.hideTool}>收起当前工具</Button>}
    {ed.tool==='polygon'&&<Button disabled={gestures.pending.length<3} onClick={gestures.finishPolygon}>完成多边形</Button>}
    {ed.tool==='angle'&&<small>依次选择边上一点、顶点、另一边上的点</small>}
    {ed.tool==='protractor'&&<><label>指定角<input aria-label="指定角度" type="number" min="0" max="180" step=".1" value={angle} onChange={event=>setAngle(number(event.target.value,45,0,180))}/>°</label><Button onClick={()=>gestures.exactAngle(angle)}>按零线画角</Button></>}
    {!strict&&<><label className="geo-check"><input type="checkbox" checked={ed.grid} onChange={event=>ed.setGrid(event.target.checked)}/>网格</label><label className="geo-check"><input type="checkbox" checked={ed.snap} onChange={event=>ed.setSnap(event.target.checked)}/>智能吸附</label><label className="geo-check"><input type="checkbox" checked={selected?.showMeasurements??ed.showMeasurements} onChange={event=>ed.showObjectMeasurements(event.target.checked)}/>尺寸标注</label></>}
   </>}
   <div className="geo-actions">
    {ed.canEdit&&<><Button aria-label="撤销" aria-keyshortcuts="Control+Z Meta+Z" disabled={!canBack} onClick={ed.undo}><Undo2 size={17}/><span>撤销</span></Button><Button aria-label="重做" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" disabled={!canForward} onClick={ed.redo}><Redo2 size={17}/><span>重做</span></Button><Button aria-label="删除对象" disabled={!ed.selected.length} onClick={()=>ed.remove()}><Trash2 size={17}/><span>删除</span></Button></>}
    <Button aria-label="缩小" onClick={()=>ed.zoomAt(1/1.2)}><ZoomOut size={17}/></Button><Button aria-label="重置视图" onClick={()=>ed.setView({x:0,y:0,zoom:1})}>{Math.round(ed.view.zoom*100)}%</Button><Button aria-label="放大" onClick={()=>ed.zoomAt(1.2)}><ZoomIn size={17}/></Button><Button aria-label="适应全部图形" onClick={ed.fitView}>适应</Button><Button aria-label="导出作图 SVG" onClick={onExport}><Download size={17}/></Button>
   </div>
  </div>
  {ed.canEdit&&ed.tool==='compass'&&<div className="geo-instrument-info"><span>{compass.penDown?'落笔：旋转画弧':'抬笔：旋转定位，不画线'}</span>{!strict&&<><span>半径 {(compass.radius/40).toFixed(2)} 单位</span><span>直径 {(compass.radius/20).toFixed(2)} 单位</span><span>开口角 {(2*Math.asin(Math.min(1,compass.radius/(2*COMPASS_LEG_LENGTH)))*180/Math.PI).toFixed(1)}°</span><span>弧绘制角 {(Math.abs(compass.sweep??0)*180/Math.PI).toFixed(1)}°</span><label>精确半径<input aria-label="圆规精确半径" type="number" min=".3" max={COMPASS_MAX_RADIUS/40} step=".01" value={Number((compass.radius/40).toFixed(2))} onChange={event=>ed.updateTool({...ed.toolState,compass:{...compass,radius:number(event.target.value,compass.radius/40,.3,COMPASS_MAX_RADIUS/40)*40,phase:'opening',radiusSource:{kind:'opening'}}},true,{gesture:'opening',radiusSource:{kind:'opening'}})}/>单位</label></>}</div>}
  {selected&&!strict&&ed.canEdit&&<div className="geo-selection-properties">
   <strong>{TOOL_LABELS[selected.pen??selected.type]??selected.type}</strong>
   {['circle','arc','segment','length','line','ray','angle'].includes(selected.type)&&<><label>{['circle','arc'].includes(selected.type)?'半径':selected.type==='angle'?'角度':'长度'}<input aria-label="选中对象精确数值" type="number" min=".01" step={selected.type==='angle'?'.1':'.01'} value={exact} onChange={event=>setExact(event.target.value)} placeholder={selected.type==='angle'?'度':'单位'}/></label><Button onClick={editNumeric}>应用数值</Button></>}
   {['rectangle','square','triangle','isoscelesTriangle','equilateralTriangle','rightTriangle','ellipse','parallelogram','rhombus','trapezoid'].includes(selected.type)&&<><label>宽<input aria-label="图形宽度" type="number" min=".01" step=".01" value={shapeSize.width} onChange={event=>setShapeSize({...shapeSize,width:event.target.value})}/></label><label>高<input aria-label="图形高度" type="number" min=".01" step=".01" value={shapeSize.height} onChange={event=>setShapeSize({...shapeSize,height:event.target.value})}/></label><Button onClick={resizeShape}>按类型重建尺寸</Button></>}
   {!['stroke','highlight','text'].includes(selected.type)&&<label>顶点名称<input aria-label="顶点名称" key={selected.id} defaultValue={selected.labels?.join(' ')??''} placeholder="A B C" onBlur={event=>ed.updateLabels(event.target.value)}/></label>}
   <label className="geo-check"><input type="checkbox" checked={selected.visible!==false} onChange={event=>ed.setObjectVisible(event.target.checked)}/>显示对象</label>
  </div>}
  </details>
 </>;
}

export function ReplayPanel({editor:ed}:{editor:GeometryEditor}){
 const count=ed.replayCount??ed.document.steps.length,total=ed.document.steps.length,partial=ed.playhead-count>0,step=ed.document.steps[Math.max(0,count-(partial?0:1))];
 return <div className="geo-replay" aria-label="作图步骤回放">
  <div className="geo-replay-controls"><Button aria-label={ed.playing?'暂停回放':'播放作图过程'} disabled={!total} onClick={ed.togglePlay}>{ed.playing?'暂停':'播放过程'}</Button><Button aria-label="回到第一步" disabled={ed.playhead===0} onClick={()=>ed.seek(0)}>首步</Button><Button aria-label="上一步" disabled={ed.playhead<=0} onClick={()=>ed.seek(Math.max(0,Math.ceil(ed.playhead)-1))}>‹</Button><input type="range" aria-label="作图回放进度" aria-valuetext={`第 ${Math.min(total,count+1)} 步，${Math.round((ed.playhead-count)*100)}%；共 ${total} 步`} min="0" max={total} step=".01" value={ed.playhead} disabled={!total} onPointerDown={()=>{if(ed.playing)ed.togglePlay();}} onChange={event=>ed.seek(Number(event.target.value))}/><Button aria-label="下一步" disabled={count>=total} onClick={()=>ed.seek(Math.min(total,Math.floor(ed.playhead)+1))}>›</Button><Button aria-label="跳到最终结果" disabled={ed.playhead>=total} onClick={()=>ed.seek(total)}>末步</Button><span>{count} / {total} 步{partial?` · ${Math.round((ed.playhead-count)*100)}%`:''}</span><select aria-label="回放速度" value={ed.speed} onChange={event=>ed.setSpeed(Number(event.target.value))}><option value=".5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select><Button disabled={ed.replayCount===null} onClick={()=>ed.replay(null)}>{ed.readOnly?'完整结果':'返回编辑'}</Button></div>
  <div className="geo-replay-description">{ed.replayCount===null?'拖动进度条或播放，查看完整作图过程。':count===0&&!partial?'初始图形':step?.description??`${TOOL_LABELS[step?.tool??'']??step?.tool??''} · ${{tool:'工具操作',create:'绘制',update:'修改',erase:'局部擦除',delete:'删除',undo:'撤销',redo:'重做',import:'导入'}[step?.operation??'tool']}`}</div>
  <div className="geo-layer-controls"><span>显示图层</span>{(!ed.mode||ed.mode==='free')&&<><label><input type="checkbox" checked={ed.layers.handwriting} onChange={event=>ed.setLayers({...ed.layers,handwriting:event.target.checked})}/>手写</label><label><input type="checkbox" checked={ed.layers.highlight} onChange={event=>ed.setLayers({...ed.layers,highlight:event.target.checked})}/>荧光标记</label></>}<label><input type="checkbox" checked={ed.layers.auxiliary} onChange={event=>ed.setLayers({...ed.layers,auxiliary:event.target.checked})}/>辅助作图</label><label><input type="checkbox" checked={ed.layers.tools} onChange={event=>ed.setLayers({...ed.layers,tools:event.target.checked})}/>实体工具</label></div>
 </div>;
}
