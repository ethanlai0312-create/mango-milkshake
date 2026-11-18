import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ScrollText,X} from 'lucide-react';
import {api} from '../lib/api';
import {Button} from '../ui/Button';
import '../styles/release-notes.css';

type ReleaseGroup={version:string;released_on:string;items:string[]};
export function ReleaseNotes(){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[groups,setGroups]=useState<ReleaseGroup[]>([]);
 const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null),closeControl=useRef<HTMLButtonElement>(null),loaded=useRef(false);
 const load=async()=>{setLoading(true);setError('');try{const data=await api<ReleaseGroup[]>('releaseNotes',{});setGroups(Array.isArray(data)?data:[]);loaded.current=true;}catch(e){setError((e as Error).message);}finally{setLoading(false);}};
 useLayoutEffect(()=>{if(!open)return;const node=dialog.current;if(!node)return;const before=document.activeElement as HTMLElement,overflow=document.body.style.overflow;node.showModal();document.body.style.overflow='hidden';closeControl.current?.focus({preventScroll:true});return()=>{node.close();document.body.style.overflow=overflow;if(before?.isConnected)before.focus({preventScroll:true});else trigger.current?.focus({preventScroll:true});};},[open]);
 useEffect(()=>()=>{if(dialog.current?.open)dialog.current.close();},[]);
 const show=()=>{setOpen(true);if(!loaded.current)void load();};
 const close=()=>setOpen(false);
 return <>
  <Button ref={trigger} className="icon-button release-notes-trigger" aria-label="更新日志" aria-haspopup="dialog" aria-expanded={open} onClick={show}><ScrollText size={20} strokeWidth={1.7}/></Button>
  {open&&<dialog ref={dialog} className="release-notes-dialog" aria-labelledby="release-notes-title" onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
   <header className="release-notes-heading"><div><h2 id="release-notes-title">更新日志</h2><p>只显示与当前账号权限相关的功能、界面和权限更新。</p></div><Button ref={closeControl} className="release-notes-close" aria-label="关闭更新日志" onClick={close}><X size={20}/></Button></header>
   <div className="release-notes-body">
    {loading&&!groups.length?<div className="release-notes-state">正在读取更新日志…</div>:error?<div className="release-notes-state error" role="alert">{error}<Button onClick={()=>void load()}>重试</Button></div>:!groups.length?<div className="release-notes-state">暂无可显示的更新。</div>:groups.map(group=><section className="release-notes-group" key={group.version}><h3>{group.version}</h3><ul>{group.items.map((item,i)=><li key={i}>{item}</li>)}</ul></section>)}
   </div>
  </dialog>}
 </>;
}
