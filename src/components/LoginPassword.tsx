import {useEffect,useRef,useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';

export function LoginPassword({value,onChange,busy}:{value:string;onChange:(value:string)=>void;busy:boolean}){
 const [visible,setVisible]=useState(false);
 const control=useRef<HTMLButtonElement>(null);
 const held=useRef<number|string|null>(null);
 function hide(){
  const pointer=held.current;
  held.current=null;
  setVisible(false);
  if(typeof pointer==='number'&&control.current?.hasPointerCapture(pointer)){
   control.current.releasePointerCapture(pointer);
  }
 }
 useEffect(()=>{
  const secondPointer=(event:PointerEvent)=>{
   if(typeof held.current==='number'&&event.pointerId!==held.current)hide();
  };
  const beforeSubmit=()=>hide();
  const form=control.current?.form;
  form?.addEventListener('submit',beforeSubmit,true);
  window.addEventListener('pointerdown',secondPointer,true);
  window.addEventListener('blur',hide);
  window.addEventListener('pagehide',hide);
  document.addEventListener('visibilitychange',hide);
  return ()=>{
   form?.removeEventListener('submit',beforeSubmit,true);
   window.removeEventListener('pointerdown',secondPointer,true);
   window.removeEventListener('blur',hide);
   window.removeEventListener('pagehide',hide);
   document.removeEventListener('visibilitychange',hide);
  };
 },[]);

 const revealed=visible&&!busy;
 return <div className="login-password">
  <label htmlFor="login-password">密码</label>
  <div className="login-password-field">
   <input id="login-password" name="password" required type={revealed?'text':'password'} autoComplete="current-password"
    autoCapitalize="none" spellCheck={false} value={value} onChange={event=>onChange(event.target.value)} placeholder="输入密码"/>
   <button ref={control} className="login-password-eye" type="button" disabled={busy}
    aria-label="按住显示密码" aria-controls="login-password"
    onPointerDown={event=>{
     if(!event.isPrimary||event.button!==0||held.current!==null)return;
     event.preventDefault();
     try{event.currentTarget.setPointerCapture(event.pointerId);}
     catch{return;}
     held.current=event.pointerId;
     setVisible(true);
    }}
    onPointerMove={event=>{
     if(held.current!==event.pointerId)return;
     const bounds=event.currentTarget.getBoundingClientRect();
     if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)hide();
    }}
    onPointerUp={hide} onPointerCancel={hide} onLostPointerCapture={hide} onBlur={hide}
    onContextMenu={event=>{event.preventDefault();hide();}}
    onKeyDown={event=>{
     if(event.key==='Escape'){hide();return;}
     if(event.key!==' '&&event.key!=='Enter')return;
     event.preventDefault();
     if(!event.repeat&&held.current===null){held.current=event.key;setVisible(true);}
    }}
    onKeyUp={event=>{if(held.current===event.key){event.preventDefault();hide();}}}>
    {revealed?<EyeOff size={18} aria-hidden/>:<Eye size={18} aria-hidden/>}
   </button>
  </div>
 </div>;
}
