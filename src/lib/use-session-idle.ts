import {useEffect} from 'react';
import {api} from './api';
import {idleEnd,isIdleExpired,observeIdle} from './session-idle';

const activityInterval=20_000;

export function useSessionIdle(id:string|undefined,onExpire:(id:string)=>void){
 useEffect(()=>{
  if(!id)return;
  const current=id;
  let deadlineTimer:number|undefined,activityTimer:number|undefined;
  let lastSent=-Infinity,pending=false,inFlight=false,stopped=false;
  const check=()=>{
   window.clearTimeout(deadlineTimer);
   if(stopped)return false;
   if(isIdleExpired(current)){
    onExpire(current);
    return false;
   }
   const end=idleEnd(current);
   if(end!==undefined)deadlineTimer=window.setTimeout(check,Math.max(0,end-Date.now()));
   return true;
  };
  const send=async(activity:boolean)=>{
   if(inFlight||!check())return;
   inFlight=true;
   if(activity){pending=false;lastSent=performance.now();}
   try{await api(activity?'sessionActivity':'sessionStatus',{},current);}
   catch{/* Network failure leaves the last confirmed deadline in force. */}
   finally{
    inFlight=false;
    if(pending&&!stopped)scheduleActivity();
   }
  };
  function scheduleActivity(){
   if(activityTimer!==undefined||inFlight)return;
   activityTimer=window.setTimeout(()=>{activityTimer=undefined;if(pending)void send(true);},
    Math.max(0,activityInterval-(performance.now()-lastSent)));
  }
  const activity=(event:Event)=>{
   if(!event.isTrusted||document.hidden)return;
   if(event.type==='pointermove'&&!(event as PointerEvent).buttons)return;
   if(event.type==='keydown'&&(event as KeyboardEvent).repeat)return;
   if(!check()){
    if(event.cancelable)event.preventDefault();
    event.stopImmediatePropagation();
    return;
   }
   if(event.type==='click'&&(event as MouseEvent).detail>0)return;
   pending=true;
   scheduleActivity();
  };
  const conceal=()=>{document.documentElement.setAttribute('data-session-suspended','');};
  const awake=()=>{
   if(check()&&!document.hidden){
    document.documentElement.removeAttribute('data-session-suspended');
    void send(false);
   }
  };
  const types=['pointerdown','pointermove','keydown','input','click','wheel','touchmove'];
  const unsubscribe=observeIdle(current,check);
  for(const type of types)window.addEventListener(type,activity,{capture:true,passive:false});
  document.addEventListener('visibilitychange',awake);
  window.addEventListener('focus',awake);
  window.addEventListener('pageshow',awake);
  window.addEventListener('pagehide',conceal);
  window.addEventListener('online',awake);
  if(check()&&idleEnd(current)===undefined)void send(false);
  return ()=>{
   stopped=true;
   window.clearTimeout(deadlineTimer);
   window.clearTimeout(activityTimer);
   unsubscribe();
   for(const type of types)window.removeEventListener(type,activity,true);
   document.removeEventListener('visibilitychange',awake);
   window.removeEventListener('focus',awake);
   window.removeEventListener('pageshow',awake);
   window.removeEventListener('pagehide',conceal);
   window.removeEventListener('online',awake);
   document.documentElement.removeAttribute('data-session-suspended');
  };
 },[id,onExpire]);
}

