import {forwardRef,useContext,useEffect,useRef,useState,type ButtonHTMLAttributes} from 'react';
import {notify} from './Feedback';
import {FormPending} from './ActionForm';
import './button-feedback.css';

type PressPhase='idle'|'down'|'held'|'released';
type ButtonProps=ButtonHTMLAttributes<HTMLButtonElement>&{
 preserveFocus?:boolean;
 /** Set from an authoritative business result, never inferred from a resolved click handler. */
 feedback?:'success'|'error';
};

/** Commands share visual feedback; native drag/canvas controls keep their own gestures. */
export const Button=forwardRef<HTMLButtonElement,ButtonProps>(function Button({
 children,onClick,disabled,preserveFocus=false,feedback,className='',type='button',
 onPointerDown,onPointerMove,onPointerUp,onPointerLeave,onPointerCancel,
 onLostPointerCapture,onKeyDown,onKeyUp,onBlur,...props
},ref){
 const [pending,setPending]=useState(false),[visible,setVisible]=useState(false),
  [actionLabel,setActionLabel]=useState<string>(),[phase,setPhase]=useState<PressPhase>('idle'),
  [localError,setLocalError]=useState(false);
 const formPending=useContext(FormPending),busy=pending||(type==='submit'&&formPending);
 const locked=useRef(false),mounted=useRef(true),element=useRef<HTMLButtonElement|null>(null);
 const loadingTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),
  holdTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),
  releaseTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),
  errorTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const pointer=useRef<{id:number;x:number;y:number}|null>(null),key=useRef<string|null>(null);

 const stopPress=()=>{
  clearTimeout(holdTimer.current);clearTimeout(releaseTimer.current);
  pointer.current=null;key.current=null;
  if(mounted.current)setPhase('idle');
 };
 const startPress=()=>{
  clearTimeout(holdTimer.current);clearTimeout(releaseTimer.current);
  setPhase('down');
  holdTimer.current=setTimeout(()=>{if(mounted.current)setPhase('held');},350);
 };
 const releasePress=()=>{
  clearTimeout(holdTimer.current);clearTimeout(releaseTimer.current);
  pointer.current=null;key.current=null;setPhase('released');
  releaseTimer.current=setTimeout(()=>{if(mounted.current)setPhase('idle');},160);
 };
 const fail=(error:unknown)=>{
  notify(error instanceof Error?error.message:'操作失败，请重试','error');
  if(!mounted.current)return;
  clearTimeout(errorTimer.current);setLocalError(true);
  errorTimer.current=setTimeout(()=>{if(mounted.current)setLocalError(false);},1800);
 };

 useEffect(()=>{mounted.current=true;return()=>{
  mounted.current=false;
  for(const timer of [loadingTimer,holdTimer,releaseTimer,errorTimer])clearTimeout(timer.current);
 };},[]);
 useEffect(()=>{
  clearTimeout(loadingTimer.current);
  if(busy){setActionLabel(element.current?.textContent?.trim());loadingTimer.current=setTimeout(()=>setVisible(true),120);}
  else setVisible(false);
  return()=>clearTimeout(loadingTimer.current);
 },[busy]);
 useEffect(()=>{if(disabled||busy)stopPress();},[disabled,busy]);
 useEffect(()=>{
  if(phase!=='down'&&phase!=='held')return;
  const cancel=()=>stopPress();
  const visibility=()=>{if(document.hidden)cancel();};
  window.addEventListener('blur',cancel);
  document.addEventListener('visibilitychange',visibility);
  return()=>{window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',visibility);};
 },[phase]);

 return <button {...props}
  ref={node=>{element.current=node;if(typeof ref==='function')ref(node);else if(ref)ref.current=node;}}
  type={type} className={'ui-button '+className} disabled={disabled}
  aria-disabled={disabled||busy||undefined}
  aria-label={props['aria-label']??(busy?actionLabel:undefined)}
  aria-busy={busy||props['aria-busy']||undefined}
  data-loading={visible||undefined} data-press-phase={phase}
  data-feedback={feedback??(localError?'error':undefined)}
  onPointerDown={event=>{
   onPointerDown?.(event);
   if(event.defaultPrevented||disabled||busy||!event.isPrimary||event.button!==0)return;
   pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};startPress();
  }}
  onPointerMove={event=>{
   onPointerMove?.(event);
   const start=pointer.current;
   // A scroll or drag cancels the hold; do not capture the pointer or prevent native gestures.
   if(start?.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)stopPress();
  }}
  onPointerUp={event=>{
   onPointerUp?.(event);
   if(pointer.current?.id!==event.pointerId)return;
   const rect=event.currentTarget.getBoundingClientRect();
   if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)stopPress();
   else releasePress();
  }}
  onPointerLeave={event=>{onPointerLeave?.(event);if(pointer.current?.id===event.pointerId)stopPress();}}
  onPointerCancel={event=>{onPointerCancel?.(event);stopPress();}}
  onLostPointerCapture={event=>{onLostPointerCapture?.(event);stopPress();}}
  onKeyDown={event=>{
   onKeyDown?.(event);
   if(event.defaultPrevented||disabled||busy||![' ','Enter'].includes(event.key))return;
   // Native Enter repeats click on keydown; a held key must execute a command once.
   if(event.repeat){event.preventDefault();return;}
   key.current=event.key;startPress();
  }}
  onKeyUp={event=>{onKeyUp?.(event);if(key.current===event.key)releasePress();}}
  onBlur={event=>{onBlur?.(event);stopPress();}}
  onClick={event=>{
   if(locked.current||busy){event.preventDefault();return;}
   if(!key.current)releasePress();
   if(!preserveFocus)event.currentTarget.focus({preventScroll:true});
   setLocalError(false);clearTimeout(errorTimer.current);
   try{
    const result=onClick?.(event) as unknown;
    if(result&&typeof (result as Promise<unknown>).then==='function'){
     locked.current=true;setPending(true);
     void Promise.resolve(result).catch(fail).finally(()=>{
      locked.current=false;if(mounted.current)setPending(false);
     });
    }
   }catch(error){fail(error);}
  }}>
  <span className="button-feedback" aria-hidden="true"/>
  <span className="button-content">{children}</span>
  {visible&&<span className="button-spinner" aria-hidden="true"/>}
 </button>;
});
