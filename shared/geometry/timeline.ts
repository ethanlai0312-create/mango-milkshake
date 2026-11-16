import type {ConstructionStep,GeometryObject,ToolState} from './types.ts';
import {clone} from './objects.ts';

export function stableStringify(value:unknown):string {
 if(value===undefined)return 'undefined';if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
 return '{'+Object.keys(value).filter(k=>(value as Record<string,unknown>)[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stableStringify((value as Record<string,unknown>)[k])).join(',')+'}';
}
export const equalData=(a:unknown,b:unknown)=>stableStringify(a)===stableStringify(b);
export type TimelineState={objects:GeometryObject[];toolState?:ToolState;undo:ConstructionStep[];redo:ConstructionStep[];errors:string[]};
export function patchObjects(objects:GeometryObject[],after:GeometryObject[],removeIds:string[]){
 const updated=new Map(after.map(o=>[o.id,o]));
 const next=objects.filter(o=>!removeIds.includes(o.id)).map(o=>{const object=updated.get(o.id);updated.delete(o.id);return object?clone(object):o;});
 for(const object of updated.values())next.push(clone(object));return next;
}
/** Availability and target lookup need only the operation stack, not geometric replay. */
export function historyStacks(steps:ConstructionStep[]){
 const undo:ConstructionStep[]=[],redo:ConstructionStep[]=[];
 for(const step of steps){
  if(step.operation==='undo'){const target=undo.pop();if(target)redo.push(target);}
  else if(step.operation==='redo'){const target=redo.pop();if(target)undo.push(target);}
  else{undo.push(step);redo.length=0;}
 }
 return{undo,redo};
}
export function inversePatch(step:ConstructionStep){
 return {after:clone(step.before),removeIds:step.after.filter(o=>!step.before.some(b=>b.id===o.id)).map(o=>o.id)};
}
export function replayTimeline(steps:ConstructionStep[],initial:GeometryObject[]=[],count=steps.length):TimelineState {
 const state:TimelineState={objects:clone(initial),undo:[],redo:[],errors:[]};
 for(const step of steps.slice(0,Math.max(0,Math.min(count,steps.length)))){
  const currentBefore=state.objects.filter(o=>step.objectIds.includes(o.id));
  if(!equalData([...currentBefore].sort((a,b)=>a.id.localeCompare(b.id)),[...step.before].sort((a,b)=>a.id.localeCompare(b.id))))state.errors.push(`步骤 ${step.index+1} 的开始对象与历史不一致`);
  if(!equalData(state.toolState,step.toolBefore))state.errors.push(`步骤 ${step.index+1} 的开始工具姿态与历史不一致`);
  if(step.objectOrderBefore&&!equalData(step.objectOrderBefore,state.objects.map(o=>o.id)))state.errors.push(`步骤 ${step.index+1} 的开始图层顺序与历史不一致`);
  if(step.operation==='undo'){
   const target=state.undo.pop();
   if(!target||step.parameters?.targetStepId!==target.id)state.errors.push(`步骤 ${step.index+1} 撤销目标无效`);
   else {const inverse=inversePatch(target);if(!equalData(step.after,inverse.after)||!equalData([...step.removedIds].sort(),[...inverse.removeIds].sort())||!equalData(step.toolAfter,target.toolBefore)||(target.objectOrderBefore&&!equalData(step.objectOrderAfter,target.objectOrderBefore)))state.errors.push(`步骤 ${step.index+1} 撤销结果无效`);state.redo.push(target);}
  }else if(step.operation==='redo'){
   const target=state.redo.pop();
   if(!target||step.parameters?.targetStepId!==target.id)state.errors.push(`步骤 ${step.index+1} 重做目标无效`);
   else {if(!equalData(step.after,target.after)||!equalData([...step.removedIds].sort(),[...target.removedIds].sort())||!equalData(step.toolAfter,target.toolAfter)||(target.objectOrderAfter&&!equalData(step.objectOrderAfter,target.objectOrderAfter)))state.errors.push(`步骤 ${step.index+1} 重做结果无效`);state.undo.push(target);}
  }else {state.undo.push(step);state.redo=[];}
  state.objects=patchObjects(state.objects,step.after,step.removedIds);
  if(step.objectOrderAfter){const byId=new Map(state.objects.map(o=>[o.id,o]));if(new Set(step.objectOrderAfter).size!==state.objects.length||step.objectOrderAfter.length!==state.objects.length||step.objectOrderAfter.some(id=>!byId.has(id)))state.errors.push(`步骤 ${step.index+1} 图层顺序无效`);else state.objects=step.objectOrderAfter.map(id=>byId.get(id)!);}
  state.toolState=clone(step.toolAfter);
 }
 return state;
}
