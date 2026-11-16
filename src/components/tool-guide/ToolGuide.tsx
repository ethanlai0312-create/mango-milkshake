import {useEffect,useId,useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react';
import {ArrowLeft,BookOpen,ChevronRight,Compass,Hand,Layers,MousePointer2,PenLine,Ruler,Search,Shapes,Triangle,X} from 'lucide-react';
import {Button} from '../../ui/Button';
import {shouldReduceMotion} from '../../lib/interface-motion';
import {GUIDE_GROUPS,GUIDE_TOPICS,findGuideTopics,type GuideTopic} from './topics';
import {GuideDiagram} from './GuideDiagram';
import './tool-guide.css';

const icons:Record<string,typeof BookOpen>={compass:Compass,ruler:Ruler,setSquare45:Triangle,setSquare30:Triangle,select:MousePointer2,pan:Hand};
function TopicIcon({topic}:{topic:GuideTopic}){const Icon=icons[topic.id]??(topic.group==='writing'?PenLine:topic.group==='shapes'?Shapes:topic.group==='workspace'?Layers:Compass);return <Icon size={19} strokeWidth={1.7} aria-hidden="true"/>;}
function trapTab(event:KeyboardEvent<HTMLDialogElement>){
 if(event.key!=='Tab')return;
 const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')).filter(node=>node.getClientRects().length);
 if(!controls.length)return;const index=controls.indexOf(document.activeElement as HTMLElement);
 if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1)?.focus();}
 else if(!event.shiftKey&&(index===controls.length-1||index<0)){event.preventDefault();controls[0]?.focus();}
}

export function ToolGuide(){
 const [open,setOpen]=useState(false),[closing,setClosing]=useState(false),[query,setQuery]=useState(''),[group,setGroup]=useState('all'),[selected,setSelected]=useState('compass'),[detail,setDetail]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null),search=useRef<HTMLInputElement>(null),closeControl=useRef<HTMLButtonElement>(null),article=useRef<HTMLElement>(null),title=useRef<HTMLHeadingElement>(null),index=useRef<HTMLDivElement>(null),closeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const id=useId(),matches=findGuideTopics(query,group),active=matches.find(t=>t.id===selected)??matches[0];
 useEffect(()=>()=>clearTimeout(closeTimer.current),[]);
 useLayoutEffect(()=>{
  if(!open)return;const node=dialog.current;if(!node)return;
  const before=document.activeElement as HTMLElement,overflow=document.body.style.overflow;
  node.showModal();document.body.style.overflow='hidden';
  // Opening the guide on touch screens must not summon a keyboard before a tool is chosen.
  (matchMedia('(max-width:740px), (pointer:coarse)').matches?closeControl.current:search.current)?.focus({preventScroll:true});
  return()=>{node.close();document.body.style.overflow=overflow;if(before?.isConnected)before.focus({preventScroll:true});else trigger.current?.focus({preventScroll:true});};
 },[open]);
 useLayoutEffect(()=>{article.current?.scrollTo({top:0,behavior:'instant'});if(detail&&matchMedia('(max-width:740px)').matches)title.current?.focus({preventScroll:true});},[active?.id,detail]);
 const close=()=>{if(closing)return;setClosing(true);const finish=()=>{setOpen(false);setClosing(false);};if(shouldReduceMotion())finish();else closeTimer.current=setTimeout(finish,180);};
 const show=()=>{clearTimeout(closeTimer.current);setQuery('');setGroup('all');setSelected('compass');setDetail(false);setClosing(false);setOpen(true);};
 const back=()=>{setDetail(false);requestAnimationFrame(()=>index.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({preventScroll:true}));};
 return <>
  <Button ref={trigger} className="icon-button tool-guide-trigger" aria-label="工具教程" aria-haspopup="dialog" aria-expanded={open} onClick={show}><BookOpen size={20} strokeWidth={1.7}/></Button>
  {open&&<dialog ref={dialog} className="tool-guide-dialog" data-closing={closing} data-detail={detail} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onKeyDown={trapTab} onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target!==event.currentTarget)return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}}>
   <header className="guide-heading"><div><h2 id={`${id}-title`}>工具教程</h2><p id={`${id}-description`}>选择工具，查看操作步骤。</p></div><Button ref={closeControl} className="icon-button" aria-label="关闭工具教程" onClick={close}><X size={20}/></Button></header>
   <div className="guide-filters"><label className="guide-search"><Search size={17} aria-hidden="true"/><input ref={search} aria-label="搜索工具教程" placeholder="搜索工具或操作" value={query} maxLength={100} onChange={event=>{setQuery(event.target.value);setDetail(false);}}/>{query&&<Button className="icon-button" aria-label="清除教程搜索" onClick={()=>{setQuery('');search.current?.focus();}}><X size={16}/></Button>}</label><div className="guide-categories" role="group" aria-label="教程分类">{GUIDE_GROUPS.map(category=><Button key={category.id} aria-pressed={group===category.id} onClick={()=>{setGroup(category.id);setDetail(false);}}>{category.name}</Button>)}</div></div>
   {matches.length?<div className="guide-body"><nav className="guide-index" aria-label="工具教程列表" ref={index}><span className="guide-count">{matches.length} 项教程</span>{matches.map(topic=><Button key={topic.id} className="guide-topic" aria-pressed={active?.id===topic.id} aria-controls={`${id}-detail`} onClick={()=>{setSelected(topic.id);setDetail(true);}}><TopicIcon topic={topic}/><span>{topic.name}</span><ChevronRight size={15} aria-hidden="true"/></Button>)}</nav><article key={active.id} ref={article} className="guide-detail" id={`${id}-detail`} aria-labelledby={`${id}-topic-title`}><Button className="guide-back ghost" onClick={back}><ArrowLeft size={17}/>返回工具列表</Button><div className="guide-topic-heading"><TopicIcon topic={active}/><span>{active.mode==='both'?'自由与严格模式':'自由模式'}</span></div><h3 ref={title} tabIndex={-1} id={`${id}-topic-title`}>{active.name}</h3><p className="guide-summary">{active.summary}</p>{active.diagram&&<GuideDiagram kind={active.diagram}/>}<ol className="guide-steps">{active.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>{active.tip&&<p className="guide-tip">{active.tip}</p>}</article></div>:<div className="guide-no-results" role="status"><Search size={24}/><h3>没有匹配的工具</h3><Button onClick={()=>{setQuery('');setGroup('all');search.current?.focus();}}>查看全部教程</Button></div>}
   <footer className="guide-footer"><span>{GUIDE_TOPICS.length} 项教程 · 仅查看，不影响作图</span><span>Esc 关闭</span></footer>
  </dialog>}
 </>;
}
