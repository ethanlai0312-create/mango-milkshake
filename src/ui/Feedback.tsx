import {useEffect,useState} from 'react';
import {Button} from './Button';
import {sessionOverlays} from '../lib/dialogs';
type Message={id:number;text:string;kind:'error'|'success'};
const listeners=new Set<(message:Message)=>void>();let sequence=0;
export function notify(text:string,kind:Message['kind']='success'){const message={id:++sequence,text,kind};listeners.forEach(listener=>listener(message));}
/** Errors persist until dismissed; important confirmations still use a modal dialog. */
export function Feedback(){
 const [message,setMessage]=useState<Message|null>(null);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;const reset=()=>{clearTimeout(timer);setMessage(null);};const listener=(next:Message)=>{clearTimeout(timer);setMessage(next);if(next.kind==='success')timer=setTimeout(()=>setMessage(null),5000);};listeners.add(listener);sessionOverlays.addEventListener('reset',reset);return()=>{listeners.delete(listener);sessionOverlays.removeEventListener('reset',reset);clearTimeout(timer);};},[]);
 return message?<div className={'feedback '+message.kind} role={message.kind==='error'?'alert':'status'}><span>{message.text}</span><Button className="feedback-close" type="button" aria-label="关闭通知" onClick={()=>setMessage(null)}>×</Button></div>:null;
}
