import {ActionForm} from '../ui/ActionForm';
import {Button} from '../ui/Button';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {subscribeDialogs,finishDialog,sessionOverlays,type DialogRequest} from '../lib/dialogs';
import {shouldReduceMotion} from '../lib/interface-motion';


/** Native modal semantics provide inert background, focus containment and Escape. */
export function InteractionLayer(){
 const [request,setRequest]=useState<DialogRequest|null>(null),[value,setValue]=useState(''),[closing,setClosing]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null),settled=useRef(false);
 const closeTimer=useRef<number|undefined>(undefined);
 useEffect(()=>subscribeDialogs(r=>{opener.current=document.activeElement as HTMLElement;settled.current=false;setValue(r.initial);setRequest(r);}),[]);
 useEffect(()=>{if(request){dialog.current?.showModal();(request.kind==='prompt'?dialog.current?.querySelector('textarea'):dialog.current?.querySelector<HTMLElement>('[data-initial-focus]'))?.focus();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};}},[request]);
 function close(result:any){if(!request||settled.current)return;settled.current=true;request.resolve(result);setClosing(true);const finish=()=>{dialog.current?.close();setClosing(false);setRequest(null);opener.current?.focus();queueMicrotask(finishDialog);};if(shouldReduceMotion())finish();else closeTimer.current=window.setTimeout(finish,180);}
 useEffect(()=>{
  if(!request)return;
  const reset=()=>{
   window.clearTimeout(closeTimer.current);
   if(!settled.current)request.resolve(request.kind==='prompt'?null:false);
   settled.current=true;
   dialog.current?.close();
   setValue('');setRequest(null);setClosing(false);
   finishDialog();
  };
  sessionOverlays.addEventListener('reset',reset);
  return()=>sessionOverlays.removeEventListener('reset',reset);
 },[request]);
 if(!request)return null;
 const danger=/删除|清空|永久|覆盖|停用/.test(request.message),prompt=request.kind==='prompt';
 return <dialog role={danger?'alertdialog':'dialog'} aria-modal="true" data-closing={closing} ref={dialog} className={'ui-dialog '+(danger?'is-danger':'')} aria-labelledby="dialog-title" aria-describedby="dialog-description" onKeyDown={e=>{if(e.key!=='Tab')return;const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]')).filter(node=>node.getClientRects().length);const index=controls.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&index<=0){e.preventDefault();controls.at(-1)?.focus();}else if(!e.shiftKey&&(index===controls.length-1||index<0)){e.preventDefault();controls[0]?.focus();}}} onCancel={e=>{e.preventDefault();close(prompt?null:false);}}>
  <ActionForm onSubmit={e=>{e.preventDefault();close(prompt?value:true);}}>
   <div className="dialog-heading"><Button type="button" className="icon-button" aria-label="关闭弹窗" onClick={()=>close(prompt?null:false)}><X size={18}/></Button></div>
   <h2 id="dialog-title">{prompt?'输入内容':danger?'请确认此操作':request.kind==='alert'?'操作提示':'继续此操作？'}</h2>
   <p id="dialog-description">{request.message}</p>
   {prompt&&<label>内容<textarea autoFocus rows={request.message.includes('每行')?7:3} value={value} onChange={e=>setValue(e.target.value)}/></label>}
   <div className="dialog-actions">{request.kind!=='alert'&&<Button data-initial-focus type="button" onClick={()=>close(prompt?null:false)}>取消</Button>}<Button data-initial-focus={request.kind==='alert'?true:undefined} className={danger?'danger-solid':'primary'} type="submit">{request.kind==='alert'?'知道了':danger?'确认操作':'确认'}</Button></div>
  </ActionForm>
 </dialog>;
}

export function LoadingState({label='加载中…'}:{label?:string}){return <div className="loading-state" role="status" aria-live="polite"><span className="loading-orbit"/><span>{label}</span><div className="skeleton-grid" aria-hidden="true"><i/><i/><i/></div></div>;}
