import {useEffect,useState} from 'react';
import {ArrowLeft,CheckCircle2,Clock3,FileText,Image as ImageIcon,Paperclip,Send,Video} from 'lucide-react';
import {Button} from '../ui/Button';
import {Upload} from '../components/Upload';
import {api} from '../lib/api';
import '../styles/reports.css';

type Attachment={id:string;name:string;mime:string;size:number};
type Message={id:string;body:string;is_admin:boolean;created_at:string;attachments:Attachment[]};
export type ReportThreadData={id:string;level1:string;level2:string;submitted_at:string;admin_read_at?:string|null;admin_replied_at?:string|null;read:boolean};
const time=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
const isImage=(mime:string)=>mime.startsWith('image/');
const isVideo=(mime:string)=>mime.startsWith('video/');
function AttachmentView({file}:{file:Attachment}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true;api<{signedUrl:string}>('fileUrl',{id:file.id,download:!isImage(file.mime)&&!isVideo(file.mime)}).then(data=>{if(active)setUrl(data.signedUrl);}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[file.id,file.mime]);
 if(error)return <div className="report-file error">{file.name}<small>{error}</small></div>;
 if(isImage(file.mime))return <figure className="report-image">{url?<img src={url} alt={file.name}/>:<div className="report-file-loading">正在读取图片…</div>}<figcaption><ImageIcon size={13}/>{file.name}</figcaption></figure>;
 if(isVideo(file.mime))return <figure className="report-video">{url?<video src={url} controls preload="metadata"/>:<div className="report-file-loading">正在读取影片…</div>}<figcaption><Video size={13}/>{file.name}</figcaption></figure>;
 return <a className="report-file" href={url||undefined} download={file.name} aria-disabled={!url}><Paperclip size={15}/><span>{file.name}</span><small>{(file.size/1024).toFixed(0)} KB · 下载查看</small></a>;
}
export function ReportThread({id,admin,onBack,onChanged}:{id:string;admin:boolean;onBack:()=>void;onChanged?:()=>void}){
 const [thread,setThread]=useState<ReportThreadData|null>(null),[messages,setMessages]=useState<Message[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[body,setBody]=useState(''),[files,setFiles]=useState<Attachment[]>([]),[sending,setSending]=useState(false);
 const load=async()=>{setLoading(true);setError('');try{const data=await api<{thread:ReportThreadData;messages:Message[]}>('reportDetail',{id});setThread(data.thread);setMessages(data.messages);onChanged?.();}catch(e){setError((e as Error).message);}finally{setLoading(false);}};
 useEffect(()=>{void load();},[id]);
 const reply=async()=>{if(!body.trim()&&!files.length)return;setSending(true);setError('');try{await api('replyReport',{id,body,attachments:files.map(f=>f.id)});setBody('');setFiles([]);await load();}catch(e){setError((e as Error).message);}finally{setSending(false);}};
 if(loading&&!thread)return <div className="card report-detail"><div className="empty">正在读取报告…</div></div>;
 if(error&&!thread)return <div className="card report-detail"><div className="notice error">{error}</div><Button onClick={onBack}>返回</Button></div>;
 if(!thread)return null;
 return <div className="card report-detail">
  <div className="report-detail-head"><Button onClick={onBack}><ArrowLeft size={16}/>返回</Button><div className={'report-status '+(thread.read?'read':'unread')}>{thread.read?<><CheckCircle2 size={15}/><i className="result-dot read"/>主管理员已阅</>:<><Clock3 size={15}/><i className="result-dot unread"/>主管理员未阅</>}</div></div>
  <div className="report-meta"><span>{thread.level1}</span>{thread.level2&&thread.level2!=='不指定二级菜单'&&<span>{thread.level2}</span>}<span>{time(thread.submitted_at)}</span></div>
  {messages.map(message=><article key={message.id} className={'report-message '+(message.is_admin?'admin':'submitter')}><header><strong>{message.is_admin?'主管理员回复':'提交内容'}</strong><time>{time(message.created_at)}</time></header>{message.body&&<div className="report-body">{message.body}</div>}{message.attachments.length>0&&<div className="report-attachments">{message.attachments.map(file=><AttachmentView key={file.id} file={file}/>)}</div>}</article>)}
  {admin&&<section className="report-reply"><h3><Send size={17}/>回复提交人</h3><textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="写下回复内容…" maxLength={20000}/><Upload purpose="report" report_id={id} onDone={file=>setFiles(list=>list.some(x=>x.id===file.id)?list:[...list,{id:file.id,name:file.name,mime:file.mime,size:file.size}])}/>{files.length>0&&<div className="report-pending-files">{files.map(file=><span key={file.id}><FileText size={14}/>{file.name}<button type="button" aria-label={'移除 '+file.name} onClick={()=>setFiles(list=>list.filter(x=>x.id!==file.id))}>×</button></span>)}</div>}{error&&<div className="notice error">{error}</div>}<Button className="primary" disabled={sending||(!body.trim()&&!files.length)} onClick={()=>void reply()}>{sending?'正在回复…':'发送回复'}</Button></section>}
 </div>;
}
