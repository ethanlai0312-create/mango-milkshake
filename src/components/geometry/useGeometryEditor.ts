import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {addObject,createObject,deleteObjects,geometryConstraintErrors,normalizeDrawing,recordStep,redoDrawing,replayDrawing,replayStepProgress,setToolState,undoDrawing,updateObjects,type ConstructionParameters,type DrawingDocument,type GeometryObject,type ObjectStyle,type ToolState} from '../../../shared/geometry';
import {confirmAction} from '../../lib/dialogs';
import {BASE_STYLE,DEFAULT_STYLES,TOOL_LABELS,fitObjectViewport,isPen,restoredTool,sameDrawingContent,type DrawingProps,type EditorTool,type Viewport} from './editor-types';
import {instrumentBounds,instrumentState,placedInstruments,selectInstrument} from './instrument-state';

export function useGeometryEditor({value,mode='free',initial,onChange,readOnly=false,authoring=false}:DrawingProps){
 const lastEmitted=useRef<DrawingDocument|null>(null);
 const normalized=useMemo(()=>lastEmitted.current&&value===lastEmitted.current&&value.mode===mode?value:normalizeDrawing(value,mode,initial),[value,mode,initial]);
 const [document,setDocument]=useState<DrawingDocument>(normalized),[tool,setTool]=useState<EditorTool>(()=>restoredTool(normalized.toolState,mode));
 const [toolState,setState]=useState<ToolState>(()=>instrumentState(normalized.toolState,mode));
 const [styles,setStyles]=useState<Record<string,ObjectStyle>>(()=>structuredClone(DEFAULT_STYLES));
 const [selectedIds,setSelectedIds]=useState<string[]>([]),[draft,setDraft]=useState<GeometryObject[]>([]);
 const [view,setView]=useState<Viewport>(()=>fitObjectViewport(normalized.objects)),[grid,setGrid]=useState(true),[snap,setSnap]=useState(true);
 const [message,setMessage]=useState(''),[eraserMode,setEraserMode]=useState<'partial'|'stroke'|'object'>('partial');
 const [rulerType,setRulerType]=useState<'segment'|'ray'|'line'>('segment');
 const [showMeasurements,setShowMeasurements]=useState(false),[replayCount,setReplayCount]=useState<number|null>(null),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[fraction,setFraction]=useState(0);
 const [layers,setLayers]=useState({handwriting:true,highlight:true,auxiliary:true,tools:true});
 const cleanState=(state:ToolState):ToolState=>mode==='strict'?{activeTool:state.activeTool==='pan'?'select':state.activeTool,visibleInstruments:placedInstruments(state,mode),ruler:state.ruler,compass:state.compass}:state;
 const latest=useRef(document),change=useRef(onChange);
 change.current=onChange;latest.current=document;
 useEffect(()=>{if(value!==lastEmitted.current){const metadataOnly=lastEmitted.current&&sameDrawingContent(normalized,lastEmitted.current);setDocument(normalized);latest.current=normalized;if(metadataOnly){lastEmitted.current=normalized;return;}setState(instrumentState(normalized.toolState,mode));setTool(restoredTool(normalized.toolState,mode));setSelectedIds([]);setDraft([]);setReplayCount(null);setFraction(0);setPlaying(false);}},[value,normalized,mode]);
 useEffect(()=>{if(mode==='strict'&&!['select','pan','ruler','compass'].includes(tool))setTool('ruler');},[mode,tool]);
 const emit=useCallback((next:DrawingDocument)=>{if(readOnly)return;latest.current=next;lastEmitted.current=next;setDocument(next);change.current(next);},[readOnly]);
 const fractionRef=useRef(fraction);fractionRef.current=fraction;
 const preview=useMemo(()=>replayCount===null?document:fraction>0?replayStepProgress(document,replayCount,fraction,initial):replayDrawing(document,replayCount,initial),[document,replayCount,fraction,initial]);
 useEffect(()=>{if(!playing)return;let frame=0;const start=performance.now(),duration=1000/speed,offset=fractionRef.current;const advance=(now:number)=>{const progress=Math.min(1,offset+(now-start)/duration);setFraction(progress);if(progress<1)frame=requestAnimationFrame(advance);else{fractionRef.current=0;setFraction(0);const next=(replayCount??0)+1;setReplayCount(next);if(next>=document.steps.length)setPlaying(false);}};frame=requestAnimationFrame(advance);return()=>cancelAnimationFrame(frame);},[playing,speed,document.steps.length,replayCount]);
 const brushKey=isPen(tool)?tool:'geometry',style=styles[brushKey]??BASE_STYLE;
 const selected=document.objects.filter(o=>selectedIds.includes(o.id)&&!o.locked);
 const activeState=replayCount===null?toolState:instrumentState(preview.toolState,mode);
 const recordedTool=restoredTool(activeState,mode);
 const visibleTool=(replayCount===null&&!readOnly?tool:recordedTool) as EditorTool;
 const canEdit=!readOnly&&replayCount===null;
 const chooseTool=(next:EditorTool)=>{
  if(!canEdit)return;if(mode==='strict'&&!['select','pan','ruler','compass'].includes(next))return;
  setTool(next);setDraft([]);setSelectedIds([]);setMessage('');
  if(next==='pan')return;
  const nextState=selectInstrument(toolState,next,mode);setState(nextState);emit(setToolState(latest.current,cleanState(nextState),next,{gesture:'select'}));return nextState;
 };
 const updateTool=(next:ToolState,persist=false,parameters?:ConstructionParameters,source:EditorTool=tool)=>{setState(next);if(persist&&canEdit)emit(setToolState(latest.current,cleanState({...next,activeTool:next.activeTool??tool}),source,parameters));};
 const hideTool=()=>{if(!canEdit)return;const next={...toolState,activeTool:'select',visibleInstruments:placedInstruments(toolState,mode).filter(id=>id!==tool)};setTool('select');setState(next);emit(setToolState(latest.current,cleanState(next),'select',{gesture:'select'}));};
 const setCompassPenDown=(penDown:boolean)=>{if(!canEdit)return;const c=toolState.compass!;updateTool({...toolState,compass:{...c,penDown,phase:c.phase==='drawing'?'ready':c.phase}},true,{gesture:'select'},'compass');setMessage(penDown?'已落笔，旋转笔脚画弧':'已抬笔，旋转只调整朝向');};
 const commitObject=(object:GeometryObject,source:string=tool,parameters?:ConstructionParameters,state=toolState)=>{
  if(!canEdit||object.locked)return;const errors=geometryConstraintErrors(object);if(errors.length){setDraft([]);setMessage('未保存退化图形，请保持不同端点和有效尺寸后重试');return;}emit(addObject(latest.current,object,source,parameters,cleanState({...state,activeTool:state.activeTool??tool})));setDraft([]);setMessage(`${TOOL_LABELS[object.type]??TOOL_LABELS[source]??'对象'}已记录`);
 };
 const replaceObjects=(objects:GeometryObject[],source:string=tool,parameters?:ConstructionParameters)=>{
  if(!canEdit)return;const editable=objects.filter(o=>!latest.current.objects.find(before=>before.id===o.id)?.locked);
  if(editable.some(o=>geometryConstraintErrors(o).length)){setDraft([]);setMessage('未应用退化尺寸，原图形已保留');return;}
  if(editable.length)emit(recordStep(latest.current,{operation:'update',tool:source,objects:editable,parameters,toolState:cleanState(toolState)}));
 };
 const remove=(ids=selectedIds)=>{if(!canEdit)return;const allowed=ids.filter(id=>!latest.current.objects.find(o=>o.id===id)?.locked);if(allowed.length)emit(deleteObjects(latest.current,allowed,mode==='strict'?'select':'eraser'));setSelectedIds([]);};
 const setStyle=(patch:Partial<ObjectStyle>)=>{
  if(!canEdit)return;
  if(selected.length){emit(updateObjects(latest.current,selected.map(o=>({...o,style:{...o.style,...patch,opacity:o.pen==='highlighter'&&patch.opacity!==undefined?Math.min(.45,Math.max(.15,patch.opacity)):patch.opacity??o.style.opacity}}))));}
  else setStyles(all=>({...all,[brushKey]:{...style,...patch}}));
 };
 const undo=()=>{if(canEdit){const next=undoDrawing(latest.current);emit(next);setState(instrumentState(next.toolState,mode));setTool(restoredTool(next.toolState,mode));setDraft([]);}};
 const redo=()=>{if(canEdit){const next=redoDrawing(latest.current);emit(next);setState(instrumentState(next.toolState,mode));setTool(restoredTool(next.toolState,mode));setDraft([]);}};
 const clear=async()=>{if(!canEdit)return;const ids=latest.current.objects.filter(o=>!o.locked).map(o=>o.id);if(ids.length&&await confirmAction('清空自己绘制的对象？题目给定图形会保留，可撤销。'))remove(ids);};
 const zoomAt=(factor:number,x=400,y=250)=>setView(previous=>{const zoom=Math.min(6,Math.max(Math.min(.25,previous.zoom),previous.zoom*factor));return{x:x-(x-previous.x)*zoom/previous.zoom,y:y-(y-previous.y)*zoom/previous.zoom,zoom};});
 const fitView=()=>setView(fitObjectViewport(preview.objects,instrumentBounds(activeState,mode)));
 const showObjectMeasurements=(enabled:boolean)=>{if(mode==='strict'||!canEdit)return;setShowMeasurements(enabled);if(selected.length)emit(updateObjects(latest.current,selected.map(o=>({...o,showMeasurements:enabled}))));};
 const updateLabels=(text:string)=>{if(!canEdit||mode==='strict')return;if(selected.length)emit(updateObjects(latest.current,selected.map(o=>({...o,labels:text.split(/[,，\s]+/).filter(Boolean),showLabels:true}))));};
 const setObjectVisible=(visible:boolean)=>{if(canEdit&&selected.length)emit(updateObjects(latest.current,selected.map(o=>({...o,visible}))));};
 const replay=(count:number|null)=>{setPlaying(false);setFraction(0);setReplayCount(count);setDraft([]);setSelectedIds([]);};
 const seek=(position:number)=>{const target=Math.max(0,Math.min(document.steps.length,position)),whole=Math.floor(target);setPlaying(false);setReplayCount(whole);setFraction(target-whole);fractionRef.current=target-whole;setDraft([]);setSelectedIds([]);};
 const playhead=replayCount===null?document.steps.length:replayCount+fraction;
 const togglePlay=()=>{if(playing){setPlaying(false);return;}if(replayCount===null||replayCount>=document.steps.length){setReplayCount(0);setFraction(0);fractionRef.current=0;}setPlaying(true);};
 const makeObject=(type:Parameters<typeof createObject>[0],points:Parameters<typeof createObject>[1],options:Parameters<typeof createObject>[2]={})=>createObject(type,points,{...options,style:{...style,...options.style},showMeasurements:mode==='free'&&(options.showMeasurements??showMeasurements)});
 return{document,latest,preview,tool,visibleTool,chooseTool,toolState,activeState,updateTool,hideTool,setCompassPenDown,styles,style,setStyle,selected,selectedIds,setSelectedIds,draft,setDraft,view,setView,zoomAt,fitView,grid,setGrid,snap,setSnap,message,setMessage,eraserMode,setEraserMode,rulerType,setRulerType,showMeasurements,showObjectMeasurements,updateLabels,setObjectVisible,commitObject,replaceObjects,remove,undo,redo,clear,emit,makeObject,readOnly,canEdit,mode,authoring,layers,setLayers,replayCount,replay,playing,togglePlay,speed,setSpeed,playhead,seek};
}
export type GeometryEditor=ReturnType<typeof useGeometryEditor>;
