import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {NAV_COMPACT_QUERY} from '../../shared/nav-gesture';
import {advanceNavigationSpring,navigationContour} from '../../shared/nav-surface';
import {NavItem,navigationButton} from './NavItem';
import {shouldReduceMotion,MOTION_CHANGE_EVENT} from '../lib/interface-motion';
import '../styles/navigation.css';

type Pose={y:number;extension:number;opacity:number};
type Label={id:string;text:string};
/** Keep the 44px shared name and its contour on exactly the same center. */
export function clampNavigationCenter(center:number,height:number){const half=Math.min(22,Math.max(0,height)/2);return Math.max(half,Math.min(Math.max(0,height)-half,center));}
export function visibleNavigationCenter(top:number,bottom:number,height:number){return height<=0||bottom<=0||top>=height?null:clampNavigationCenter((top+bottom)/2,height);}
/** Persistent rail + extension. Only its contour and shared name region move. */
export function NavSurface({expanded,onExpand,children}:{expanded:string;onExpand:(id:string)=>void;children:ReactNode}){
 const [compact,setCompact]=useState(()=>matchMedia(NAV_COMPACT_QUERY).matches);
 const [label,setLabel]=useState<Label>({id:'',text:''}),[previous,setPrevious]=useState('');
 const path=useRef<SVGPathElement>(null),surface=useRef<SVGSVGElement>(null),name=useRef<HTMLDivElement>(null),measurement=useRef<HTMLSpanElement>(null);
 const pose=useRef<Pose>({y:100,extension:0,opacity:0}),velocity=useRef<Pose>({y:0,extension:0,opacity:0}),target=useRef<Pose>({...pose.current});
 const frame=useRef(0),stamp=useRef(0),currentLabel=useRef(label),dismissTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 currentLabel.current=label;
 const reduced=shouldReduceMotion;
 const paint=()=>{
  const rail=document.getElementById('workspace-navigation'),base=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail-width'))||76,height=innerHeight;
  if(!rail)return;
  const p=pose.current,center=clampNavigationCenter(p.y,height);
  surface.current?.setAttribute('viewBox',`0 0 ${Math.min(innerWidth,244)} ${height}`);
  path.current?.setAttribute('d',navigationContour(base,p.extension,center,height));
  if(name.current){name.current.style.transform=`translate3d(${base-8}px,${center-22}px,0)`;name.current.style.opacity=String(Math.max(0,Math.min(1,p.opacity)));name.current.style.width=`${Math.max(1,p.extension)}px`;name.current.style.pointerEvents=p.opacity>.3?'auto':'none';}
 };
 const tick=(now:number)=>{
  const dt=stamp.current?(now-stamp.current)/1000:1/60;stamp.current=now;let moving=false;
  for(const key of ['y','extension','opacity'] as const){const next=advanceNavigationSpring(pose.current[key],velocity.current[key],target.current[key],dt);pose.current[key]=next.value;velocity.current[key]=next.velocity;if(Math.abs(next.value-target.current[key])>.02||Math.abs(next.velocity)>.02)moving=true;else{pose.current[key]=target.current[key];velocity.current[key]=0;}}
  paint();frame.current=moving?requestAnimationFrame(tick):0;if(!moving)stamp.current=0;
 };
 const animate=()=>{cancelAnimationFrame(frame.current);frame.current=0;if(reduced()){stamp.current=0;pose.current={...target.current};velocity.current={y:0,extension:0,opacity:0};paint();}else frame.current=requestAnimationFrame(tick);};
 const measure=()=>{
  const button=expanded?navigationButton(expanded):null;
  if(button){const rect=button.getBoundingClientRect(),center=visibleNavigationCenter(rect.top,rect.bottom,innerHeight);if(center===null){target.current={...target.current,extension:0,opacity:0};onExpand('');animate();return;}const text=button.dataset.navLabel??button.getAttribute('aria-label')??'';if(measurement.current)measurement.current.textContent=text;const width=Math.min(128,Math.max(52,(measurement.current?.getBoundingClientRect().width??text.length*14)+24));target.current={y:center,extension:width,opacity:1};}
  else target.current={...target.current,extension:0,opacity:0};
  animate();
 };
 useLayoutEffect(()=>{
  if(compact)return;
  const button=expanded?navigationButton(expanded):null;
  if(button){const next={id:expanded,text:button.dataset.navLabel??''};if(next.id!==currentLabel.current.id){setPrevious(currentLabel.current.text);setLabel(next);}}
  measure();
 },[expanded,compact]);
 useEffect(()=>{
  const media=matchMedia(NAV_COMPACT_QUERY),change=()=>{cancelAnimationFrame(frame.current);frame.current=0;stamp.current=0;pose.current={...pose.current,extension:0,opacity:0};target.current={...target.current,extension:0,opacity:0};velocity.current={y:0,extension:0,opacity:0};setCompact(media.matches);onExpand('');};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);
 },[onExpand]);
 useEffect(()=>{
  if(compact)return;
  const rail=document.getElementById('workspace-navigation'),clearDismiss=()=>clearTimeout(dismissTimer.current);
  const leave=(event:PointerEvent)=>{if(event.relatedTarget instanceof Element&&event.relatedTarget.closest('.nav-surface-hit'))return;clearDismiss();onExpand('');};
  const move=(event:PointerEvent)=>{if(event.buttons||event.pointerType!=='mouse')return;if(event.target instanceof Element&&event.target.closest('.rail-item')){clearDismiss();return;}clearDismiss();dismissTimer.current=setTimeout(()=>onExpand(''),120);};
  const redraw=()=>measure(),cancel=()=>{clearDismiss();onExpand('');};
  rail?.addEventListener('pointerleave',leave);rail?.addEventListener('pointermove',move);rail?.addEventListener('scroll',redraw,{passive:true});window.addEventListener('resize',redraw);window.addEventListener('blur',cancel);window.addEventListener(MOTION_CHANGE_EVENT,redraw);const media=matchMedia('(prefers-reduced-motion:reduce)');media.addEventListener('change',redraw);
  return()=>{clearDismiss();rail?.removeEventListener('pointerleave',leave);rail?.removeEventListener('pointermove',move);rail?.removeEventListener('scroll',redraw);window.removeEventListener('resize',redraw);window.removeEventListener('blur',cancel);window.removeEventListener(MOTION_CHANGE_EVENT,redraw);media.removeEventListener('change',redraw);};
 },[expanded,compact,onExpand]);
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);frame.current=0;stamp.current=0;clearTimeout(dismissTimer.current);},[]);
 return <>{children}{!compact&&createPortal(<div className="nav-surface-layer" aria-hidden="true"><svg ref={surface} className="nav-surface-contour" width="244" height="100%" preserveAspectRatio="none"><path ref={path} fill="var(--surface)"/></svg><span ref={measurement} className="nav-surface-measure"/><div ref={name} className="nav-surface-hit" onPointerEnter={()=>clearTimeout(dismissTimer.current)} onPointerLeave={e=>{if(!(e.relatedTarget instanceof Element&&e.relatedTarget.closest('.sidebar,.nav-surface-hit')))onExpand('');}}>{label.id&&<NavItem proxy id={label.id} label={label.text} icon={null} expanded={expanded} onExpand={onExpand} onSelect={()=>navigationButton(label.id)?.click()}/>}<div className="nav-surface-names"><span key={'old-'+label.id} className="nav-surface-previous">{previous}</span><span key={label.id} className="nav-surface-current">{label.text}</span></div></div></div>,document.body)}</>;
}
