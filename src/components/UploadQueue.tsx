import {canDeleteContent} from '../../shared/roles';
import {getReadCacheRole} from '../lib/read-cache';
import {Button} from '../ui/Button';
import {Upload as TusUpload} from 'tus-js-client';
import {useEffect,useRef,useState} from 'react';
import {uploadTokenNeedsRenewal} from '../../shared/upload-token';
import {api,supabaseUrl,serverNow} from '../lib/api';
import {fileSizeError} from '../../shared/files';
type Task={id:string;file:File;status:'queued'|'uploading'|'verifying'|'done'|'failed'|'cancelled';progress:number;error?:string;ticket?:any;running?:boolean;uploaded?:boolean};
const statuses={queued:'等待上传',uploading:'正在上传',verifying:'正在验证',done:'上传成功',failed:'上传失败',cancelled:'已取消'};
export function Upload({purpose,exam_id,attempt_id,onDone}:{purpose:string;exam_id?:string;attempt_id?:string;onDone:(f:any)=>void}){
 const [tasks,setTasks]=useState<Task[]>([]),queue=useRef<Task[]>([]),active=useRef(0),requests=useRef(new Map<string,{abort:()=>void|Promise<void>}>()),mounted=useRef(true);
 const render=()=>{if(mounted.current)setTasks(queue.current.map(t=>({...t})));};
 useEffect(()=>{mounted.current=true;const before=(event:BeforeUnloadEvent)=>{if(active.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);return()=>{mounted.current=false;window.removeEventListener('beforeunload',before);};},[]);
 function pump(){while(active.current<2){const task=queue.current.find(t=>t.status==='queued');if(!task)return;active.current++;task.running=true;task.status='uploading';render();void upload(task).finally(()=>{active.current--;task.running=false;requests.current.delete(task.id);render();pump();});}}
 async function upload(task:Task){try{const ticket=task.ticket??await api('upload',{purpose,exam_id,attempt_id,name:task.file.name,size:task.file.size,mime:task.file.type||'application/octet-stream'});task.ticket=ticket;if(task.status==='cancelled'){if(canDeleteContent(getReadCacheRole()??'')){await api('deleteFile',{id:ticket.file.id});task.ticket=undefined;}return;}
  if(!task.uploaded){if(uploadTokenNeedsRenewal(ticket.token,serverNow()))Object.assign(ticket,await api('renewUpload',{id:ticket.file.id}));if(task.file.size>6*1024*1024){await new Promise<void>((resolve,reject)=>{const storageUrl=new URL(supabaseUrl);if(storageUrl.hostname.endsWith('.supabase.co'))storageUrl.hostname=storageUrl.hostname.replace('.supabase.co','.storage.supabase.co');let renewRequired=false;const tus:TusUpload=new TusUpload(task.file,{endpoint:storageUrl.origin+storageUrl.pathname.replace(/\/$/,'')+'/storage/v1/upload/resumable/sign',headers:{apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},metadata:{bucketName:'mango-private',objectName:ticket.file.path,contentType:task.file.type||'application/octet-stream'},onBeforeRequest:async request=>{if(task.status==='cancelled')throw new Error('已取消');if(renewRequired||uploadTokenNeedsRenewal(ticket.token,serverNow())){Object.assign(ticket,await api('renewUpload',{id:ticket.file.id}));renewRequired=false;}request.setHeader('x-signature',ticket.token);},onAfterResponse:(_request,response)=>{
 if(response.getHeader('x-mango-upload-renew')==='1')renewRequired=true;
 const resume=response.getHeader('x-mango-upload-resume');
 if(resume){const url=new URL(resume,storageUrl);if(url.origin===storageUrl.origin&&url.pathname.startsWith(storageUrl.pathname.replace(/\/$/,'')+'/storage/v1/upload/resumable/sign/'))tus.url=url.href;}
},chunkSize:6*1024*1024,uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,retryDelays:[0,1500,3000,6000],fingerprint:async()=>ticket.file.owner_id+':'+ticket.file.id+':'+task.file.size,onProgress:(sent,total)=>{task.progress=Math.round(sent/total*100);render();},onSuccess:()=>resolve(),onError:reject});requests.current.set(task.id,{abort:async()=>{await tus.abort(false);reject(new Error('已取消，可重试续传'));}});void tus.findPreviousUploads().then(previous=>{if(previous.length)tus.resumeFromPreviousUpload(previous[0]);if(task.status==='cancelled'){reject(new Error('已取消'));return;}tus.start();}).catch(reject);});}else await new Promise<void>((resolve,reject)=>{
 let renewed=false;
 const send=()=>{
  if(task.status==='cancelled'){reject(new Error('已取消'));return;}
  const xhr=new XMLHttpRequest();requests.current.set(task.id,xhr);xhr.open('PUT',ticket.signedUrl);
  xhr.setRequestHeader('Content-Type',task.file.type||'application/octet-stream');
  xhr.upload.onprogress=e=>{if(e.lengthComputable){task.progress=Math.round(e.loaded/e.total*100);render();}};
  xhr.onload=()=>{
   if(xhr.status>=200&&xhr.status<300){resolve();return;}
   if(xhr.getResponseHeader('x-mango-upload-renew')==='1'&&!renewed){
    renewed=true;void api('renewUpload',{id:ticket.file.id}).then(next=>{Object.assign(ticket,next);send();}).catch(reject);return;
   }
   reject(new Error('上传服务返回 '+xhr.status));
  };
  xhr.onerror=()=>reject(new Error('网络中断，请重试'));xhr.onabort=()=>reject(new Error('已取消'));xhr.send(task.file);
 };send();
});task.uploaded=true;}
  task.status='verifying';task.progress=100;render();const verified=await api('verifyUpload',{id:ticket.file.id});task.status='done';onDone(verified.file??ticket.file);
 }catch(error){if(task.status!=='cancelled'){task.status='failed';task.error=(error as Error).message;}}
 }
 function add(files:File[]){for(const file of files){const error=fileSizeError(file.size);queue.current.push({id:crypto.randomUUID(),file,status:error?'failed':'queued',progress:0,error:error??undefined});}render();pump();}
 return <div className="upload" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();add(Array.from(e.dataTransfer.files));}}><label className="button secondary">选择或拖入文件<input aria-label="上传文件" type="file" multiple className="visually-hidden" onChange={e=>{add(Array.from(e.target.files??[]));e.target.value='';}}/></label><small>支持批量上传</small>{tasks.map(task=><div className="upload-task" key={task.id}><strong>{task.file.name}</strong><span role="status">{statuses[task.status]} · {task.progress}%</span><progress max="100" value={task.progress}/>{task.error&&<small className="danger">{task.error}</small>}<div className="actions">{['queued','uploading'].includes(task.status)&&<Button onClick={()=>{const current=queue.current.find(t=>t.id===task.id)!;current.status='cancelled';requests.current.get(task.id)?.abort();render();}}>取消</Button>}{['failed','cancelled'].includes(task.status)&&!fileSizeError(task.file.size)&&<Button disabled={task.running} onClick={()=>{const current=queue.current.find(t=>t.id===task.id)!;current.status='queued';current.error=undefined;current.progress=0;render();pump();}}>重试</Button>}</div></div>)}</div>;
}
