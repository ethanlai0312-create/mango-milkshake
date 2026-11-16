import {useEffect,useRef,useState,type ReactNode} from 'react';
import {NAV_COMPACT_QUERY} from '../../shared/nav-gesture';
/** Keep wheel and blank-area dragging inside the rail, without extra controls. */
export function ScrollRail({className,children,open=false}:{className:string;children:ReactNode;open?:boolean}){
 const rail=useRef<HTMLElement>(null),drag=useRef<{id:number;y:number}|null>(null);
 const [compact,setCompact]=useState(()=>matchMedia(NAV_COMPACT_QUERY).matches);
 useEffect(()=>{const media=matchMedia(NAV_COMPACT_QUERY),change=()=>setCompact(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>{const element=rail.current;if(!element)return;const wheel=(event:WheelEvent)=>{if(element.scrollHeight<=element.clientHeight||!event.deltaY)return;event.preventDefault();event.stopPropagation();const unit=event.deltaMode===1?16:event.deltaMode===2?element.clientHeight:1;element.scrollTop+=event.deltaY*unit;};element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);},[]);
 return <aside ref={rail} id="workspace-navigation" className={className} role={compact?'dialog':undefined} aria-modal={compact&&open?true:undefined} aria-label="功能导航" inert={compact&&!open}
  onPointerDown={e=>{if(e.target!==e.currentTarget||!e.isPrimary||e.button!==0)return;e.preventDefault();drag.current={id:e.pointerId,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
  onPointerMove={e=>{const active=drag.current;if(!active||active.id!==e.pointerId)return;e.currentTarget.scrollTop+=active.y-e.clientY;active.y=e.clientY;}}
  onPointerUp={e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
  onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>{children}</aside>;
}
