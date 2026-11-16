import {useEffect,useRef,useState} from 'react';
import {Button} from './Button';
/** Opt-in, local-only measurements. No network or telemetry storage. */
export function AuditPanel(){
 const values=useRef({cls:0,interactions:new Map<number,number>(),longTasks:0,maxTask:0}),raf=useRef(0);
 const [snapshot,setSnapshot]=useState({cls:0,samples:0,p98:0,longTasks:0,maxTask:0}),[frames,setFrames]=useState('未采样');
 useEffect(()=>{
  const observers:PerformanceObserver[]=[];let start=0,last=0,session=0;
  const watch=(type:string,callback:(entries:any[])=>void)=>{if(!PerformanceObserver.supportedEntryTypes.includes(type))return;const observer=new PerformanceObserver(list=>callback(list.getEntries()));observer.observe({type,buffered:true,...type==='event'?{durationThreshold:16}:{}} as PerformanceObserverInit);observers.push(observer);};
  watch('layout-shift',entries=>{for(const entry of entries){if(entry.hadRecentInput)continue;if(entry.startTime-last<1000&&entry.startTime-start<5000)session+=entry.value;else{start=entry.startTime;session=entry.value;}last=entry.startTime;values.current.cls=Math.max(values.current.cls,session);}});
  watch('event',entries=>{for(const entry of entries)if(entry.interactionId)values.current.interactions.set(entry.interactionId,Math.max(values.current.interactions.get(entry.interactionId)??0,entry.duration));});
  watch('longtask',entries=>{for(const entry of entries){values.current.longTasks++;values.current.maxTask=Math.max(values.current.maxTask,entry.duration);}});
  const timer=setInterval(()=>{const v=values.current,durations=[...v.interactions.values()].sort((a,b)=>b-a);setSnapshot({cls:v.cls,samples:durations.length,p98:durations[Math.floor(durations.length/50)]??0,longTasks:v.longTasks,maxTask:v.maxTask});},1000);
  return()=>{observers.forEach(observer=>observer.disconnect());clearInterval(timer);cancelAnimationFrame(raf.current);};
 },[]);
 function sample(){cancelAnimationFrame(raf.current);setFrames('采样中…');const intervals:number[]=[];let first=0,last=0;const frame=(time:number)=>{if(!first)first=time;if(last)intervals.push(time-last);last=time;if(time-first<4000)raf.current=requestAnimationFrame(frame);else{const sorted=[...intervals].sort((a,b)=>a-b),mean=intervals.reduce((a,b)=>a+b,0)/intervals.length,p95=sorted[Math.floor(sorted.length*.95)]??0;setFrames(`${intervals.length}帧；平均 ${mean.toFixed(1)}ms；P95 ${p95.toFixed(1)}ms`);}};raf.current=requestAnimationFrame(frame);}
 return <details className="audit-panel"><summary>UI 测量（本机）</summary><output>CLS {snapshot.cls.toFixed(4)} · 交互P98 {snapshot.samples?snapshot.p98+'ms':'无≥16ms样本'} · 样本 {snapshot.samples} · 长任务 {snapshot.longTasks} · 最长 {snapshot.maxTask.toFixed(1)}ms</output><p>本次实验样本，不代表真实用户 INP 或全设备60FPS。</p><Button onClick={sample}>采样4秒动画帧</Button><output>{frames}</output></details>;
}
