import {useEffect,useRef,type ReactNode} from 'react';
import {NavigationPress,NAV_LABEL_DELAY_MS,NAV_COMPACT_QUERY} from '../../shared/nav-gesture';
export const navigationButton=(id:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar .rail-trigger')).find(button=>button.closest<HTMLElement>('[data-nav-id]')?.dataset.navId===id)??null;
export const navigationHit=(x:number,y:number)=>{const element=document.elementFromPoint(x,y),proxy=element?.closest<HTMLElement>('[data-nav-proxy]');return proxy?navigationButton(proxy.dataset.navProxy??''):element?.closest<HTMLElement>('.rail-item')?.querySelector<HTMLButtonElement>('.rail-trigger')??null;};
/** Existing mouse hover has already established preview intent before the press. */
export function beginNavigationPress(press:NavigationPress,pointer:number,id:string,now:number,y:number,visiblePreview:boolean){if(!press.start(pointer,id,now-(visiblePreview?NAV_LABEL_DELAY_MS:0),y))return false;if(visiblePreview)press.preview(pointer,now);return true;}
export function NavItem({id,label,icon,selected,expanded,onExpand,onSelect,proxy=false,onIntent}:{id:string;label:string;icon:ReactNode;selected?:boolean;expanded:string;onExpand:(id:string)=>void;onSelect:()=>void;proxy?:boolean;onIntent?:(id:string)=>void}){
 const press=useRef(new NavigationPress()),suppressClick=useRef(false),open=expanded===id;
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const stopTimer=()=>{clearTimeout(timer.current);timer.current=undefined;};
 useEffect(()=>()=>stopTimer(),[]);
 return <div data-nav-id={id} data-nav-proxy={proxy?id:undefined} className={'rail-item '+(open?'expanded':'')} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)&&!(e.relatedTarget instanceof Element&&e.relatedTarget.closest('.nav-surface-hit'))){stopTimer();onExpand('');}}} onPointerEnter={e=>{onIntent?.(id);if(e.pointerType==='mouse'&&e.buttons===0&&!matchMedia(NAV_COMPACT_QUERY).matches){stopTimer();if(expanded)onExpand(id);else timer.current=setTimeout(()=>onExpand(id),NAV_LABEL_DELAY_MS);}}} onPointerLeave={e=>{if(e.pointerType==='mouse'&&e.buttons===0){stopTimer();if(!(e.relatedTarget instanceof Element&&e.relatedTarget.closest('.sidebar,.nav-surface-hit')))onExpand('');}}}>
  <button type="button" className={'rail-trigger '+(selected?'active':'')} tabIndex={proxy?-1:undefined} aria-label={label} aria-current={selected?'page':undefined} data-expanded={open} data-nav-label={label}
   onFocus={e=>{onIntent?.(id);if(e.currentTarget.matches(':focus-visible'))onExpand(id);}}
   onPointerDown={e=>{onIntent?.(id);const inheritPreview=e.pointerType==='mouse'&&Boolean(expanded);if(!e.isPrimary||e.button!==0||!beginNavigationPress(press.current,e.pointerId,id,Date.now(),e.clientY,inheritPreview))return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);stopTimer();if(inheritPreview)onExpand(id);else onExpand('');const pointerId=e.pointerId;timer.current=setTimeout(()=>onExpand(press.current.preview(pointerId)??''),NAV_LABEL_DELAY_MS);}}
   onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const delta=press.current.drag(e.pointerId,e.clientY);if(delta!==null){stopTimer();onExpand('');document.getElementById('workspace-navigation')?.scrollBy({top:delta,behavior:'instant'});return;}const target=navigationHit(e.clientX,e.clientY)?.closest<HTMLElement>('.rail-item')?.dataset.navId??null;if(press.current.move(e.pointerId,target))onExpand(press.current.preview(e.pointerId)??'');}}
   onPointerUp={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const button=navigationHit(e.clientX,e.clientY);const target=button?.closest<HTMLElement>('.rail-item')?.dataset.navId??null;press.current.move(e.pointerId,target);stopTimer();const destination=press.current.finish(e.pointerId);suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},0);e.currentTarget.releasePointerCapture(e.pointerId);onExpand('');if(destination===id)onSelect();else if(destination)button?.click();}}
   onPointerCancel={e=>{stopTimer();press.current.finish(e.pointerId,true);onExpand('');}}
   onLostPointerCapture={e=>{stopTimer();press.current.finish(e.pointerId,true);}}
   onContextMenu={e=>e.preventDefault()}
   onClick={()=>{if(!suppressClick.current){onExpand('');onSelect();}}}>{icon}<span aria-hidden="true" className="rail-label">{label}</span></button>
 </div>;
}
