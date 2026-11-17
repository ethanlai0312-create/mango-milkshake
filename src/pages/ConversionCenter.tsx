import {canDeleteContent} from '../../shared/roles';
import {Button} from '../ui/Button';
import {confirmAction} from '../lib/dialogs';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../lib/api';
import {isAuthorizationError} from '../lib/api-error';
import {peekRead} from '../lib/read-cache';
import {useCachedPage} from './useCachedPage';
import {beijingTime} from '../lib/time';
import {Upload} from '../components/Upload';
import {conversionFormats,targetsFor} from '../../shared/conversion';

const states:Record<string,string>={queued:'等待处理',running:'正在转换',completed:'转换完成',failed:'转换失败',cancelled:'已取消'};
export function ConversionCenter({role='visitor'}:{role?:string}={}){
 const [inputs,setInputs]=useState<any[]>(()=>peekRead<any[]>('conversionInputs')??[]),[inputsReady,setInputsReady]=useState(()=>peekRead('conversionInputs')!==undefined),[selected,setSelected]=useState<string[]>([]),[targets,setTargets]=useState<Record<string,string>>({});
 const [initialized,setInitialized]=useState(()=>peekRead('conversions',{offset:0})!==undefined||peekRead('conversionInputs')!==undefined);
 const [offset,setOffset]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[configured,setConfigured]=useState<boolean|null>(()=>peekRead<{configured:boolean}>('conversionInfo')?.configured??null);
 const {data:jobs,loading:initialLoading,setData:setJobs,fail}=useCachedPage<any[]>('conversions',{offset},[]);
 const submitting=useRef(false),generation=useRef(0),polling=useRef(true);
 const refresh=useCallback(async(includeInputs=false)=>{
  const version=++generation.current;
  try{const [rows,files]=await Promise.all([api('conversions',{offset}),includeInputs?api('conversionInputs'):Promise.resolve(null)]);if(version===generation.current){setJobs(rows);if(files){setInputs(files);setInputsReady(true);setSelected(s=>s.filter(id=>files.some((file:any)=>file.id===id)));}polling.current=rows.some((job:any)=>['queued','running'].includes(job.status));}}
  catch(e){if(version===generation.current){setError((e as Error).message);fail(e);if(isAuthorizationError(e)){setInputs([]);setSelected([]);setInputsReady(true);polling.current=false;}}}
  finally{if(version===generation.current)setInitialized(true);}
 },[offset]);
 useEffect(()=>{void refresh(true);const timer=setInterval(()=>{if(polling.current)void refresh();},10000);const online=()=>void refresh(true);window.addEventListener('online',online);return()=>{clearInterval(timer);window.removeEventListener('online',online);generation.current++;};},[refresh]);
 useEffect(()=>{api('conversionInfo').then(info=>setConfigured(info.configured)).catch(e=>setError(e.message));},[]);
 async function run(action:()=>Promise<void>){if(submitting.current)return;submitting.current=true;setBusy(true);setError('');try{await action();await refresh(true);}catch(e){setError((e as Error).message);}finally{submitting.current=false;setBusy(false);}}
 async function start(ids:string[]){await run(async()=>{
  let accepted=0;const failures:string[]=[];
  for(const id of ids){const file=inputs.find(f=>f.id===id);if(!file)continue;
   try{await api('createConversion',{file_id:id,target:targets[id]??targetsFor(file.name)[0]});accepted++;setSelected(s=>s.filter(x=>x!==id));}
   catch(e){failures.push(`${file.name}：${(e as Error).message}`);}
  }
  setNotice(`已提交 ${accepted} 个转换任务。${failures.length?'未提交的文件保留勾选，可稍后重试。':''}`);if(failures.length)setError(failures.join('；'));
 });}
 const counts:Record<string,number>=jobs.reduce((result:Record<string,number>,job)=>({...result,[job.status]:(result[job.status]??0)+1}),{});
 return <div className="conversion-page" data-page-pending={initialLoading&&!initialized}>
  <div className="page-heading"><div><h1>文档转换</h1><p>私人文件 · 结果保留24小时</p></div></div>
  {error&&<div className="notice error" role="alert">{error}</div>}{notice&&<div className="notice" role="status">{notice}</div>}
  <section className="card"><h2>上传文档</h2><Upload purpose="conversion" onDone={file=>{setInputs(s=>[file,...s.filter(x=>x.id!==file.id)]);if(targetsFor(file.name).length)setSelected(s=>[...new Set([...s,file.id])]);}}/>
   <details className="compact-help"><summary>使用说明</summary><ul><li>上传不限单文件大小，实际受磁盘和网络影响。</li><li>排版可能变化；扫描件暂不支持OCR。</li><li>PDF最多100页，图片最多4000万像素，单次转换最长120秒。</li><li>最多8个待处理任务，每24小时最多50个任务。显示最近100个上传文件。</li></ul></details>
   <div className="conversion-status" role="status">{configured===null?'':configured?'服务就绪':'服务未连接，任务等待中'}<Button disabled={busy||!configured} onClick={async()=>void run(async()=>{await api('wakeConverter');setNotice('已刷新任务');})}>刷新任务</Button></div>
  </section>
  <section className="card"><h2>待转换文件</h2>
   <div className="actions"><Button disabled={busy||!inputs.some(f=>targetsFor(f.name).length)} onClick={async()=>setSelected(inputs.filter(f=>targetsFor(f.name).length).map(f=>f.id))}>全选</Button><Button disabled={busy||!selected.length} onClick={async()=>setSelected([])}>取消选择</Button><Button className="primary" disabled={busy||!selected.length} onClick={async()=>void start(selected)}>{busy?'正在提交…':`开始转换（${selected.length}）`}</Button></div>
   {inputs.map(file=>{const formats=targetsFor(file.name);return <div className="file-row" key={file.id}><label><input type="checkbox" aria-label={`选择 ${file.name}`} disabled={busy||!formats.length} checked={selected.includes(file.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,file.id]:s.filter(id=>id!==file.id))}/><strong>{file.name}</strong></label><small>{(file.size/1000000).toFixed(2)} MB</small>{canDeleteContent(role)&&<Button disabled={busy} onClick={async()=>{if(await confirmAction('删除这个私人输入文件？仍有转换记录引用时会保留。'))void run(async()=>{await api('deleteFile',{id:file.id});setNotice('已删除私人输入文件。');});}}>删除文件</Button>}{formats.length?<><select aria-label={`${file.name} 的目标格式`} value={targets[file.id]??formats[0]} disabled={busy} onChange={e=>setTargets(t=>({...t,[file.id]:e.target.value}))}>{formats.map(format=><option key={format} value={format}>{format.toUpperCase()}{format==='png'?'（逐页图片ZIP）':''}</option>)}</select><Button disabled={busy} onClick={async()=>void start([file.id])}>开始转换</Button></>:<span>暂不支持此格式</span>}</div>;})}
   {inputsReady&&!inputs.length&&<div className="empty">暂无文件</div>}
   <details><summary>支持格式</summary><div className="table-wrap"><table><thead><tr><th>输入</th><th>目标格式</th></tr></thead><tbody>{Object.entries(conversionFormats).map(([source,formats])=><tr key={source}><td>{source.toUpperCase()}</td><td>{formats.join(' · ').toUpperCase()}</td></tr>)}<tr><td>WPS / ET / DPS / Pages / Numbers / Keynote</td><td>暂不支持</td></tr></tbody></table></div></details>
  </section>
  <section className="card"><h2>转换记录</h2>{jobs.length>0&&<p role="status">{Object.entries(states).filter(([key])=>counts[key]).map(([key,label])=>`${label} ${counts[key]}`).join(' · ')}</p>}
   <div className="table-wrap"><table className="responsive-records"><thead><tr><th>文件 / 目标</th><th>状态</th><th>创建 / 到期</th><th>操作</th></tr></thead><tbody>{jobs.map(job=>{const expired=Date.parse(job.expires_at)<Date.now();return <tr key={job.id}><td data-label="文件"><strong>{job.files?.name??'原文件已移除'}</strong><small>→ {job.target.toUpperCase()}{job.target==='png'?'（ZIP）':''}</small></td><td data-label="状态"><span role="status">{states[job.status]??job.status}</span>{job.error&&<small className="danger">{job.error}</small>}{expired&&<small>结果已到期</small>}</td><td data-label="日期">{beijingTime(job.created_at)}<small>{beijingTime(job.expires_at)}</small></td><td data-label="操作"><div className="actions">{job.status==='completed'&&<Button disabled={busy||expired} onClick={async()=>void run(async()=>{const result=await api('conversionDownload',{id:job.id});const link=document.createElement('a');link.href=result.signedUrl;link.target='_blank';link.rel='noopener';link.click();})}>下载结果</Button>}{canDeleteContent(role)&&job.status==='queued'&&<Button disabled={busy} onClick={async()=>void run(async()=>{await api('cancelConversion',{id:job.id});setNotice('已取消等待中的任务。');})}>取消等待</Button>}{['failed','cancelled'].includes(job.status)&&!expired&&<Button disabled={busy} onClick={async()=>void run(async()=>{await api('createConversion',{file_id:job.input_file_id,target:job.target});setNotice('已创建新的重试任务，原记录保留。');})}>重新转换</Button>}{canDeleteContent(role)&&job.status!=='running'&&<Button className="danger" disabled={busy} onClick={async()=>{if(await confirmAction('删除此记录及没有其他任务引用的私人文件？'))void run(async()=>{await api('deleteConversion',{id:job.id});setNotice('已删除所选转换记录。');});}}>删除</Button>}</div></td></tr>;})}</tbody></table></div>
   {!initialLoading&&!jobs.length&&!error&&<div className="empty">暂无转换记录</div>}<div className="actions"><Button disabled={busy||offset===0} onClick={async()=>setOffset(n=>Math.max(0,n-50))}>上一页</Button><span>第 {Math.floor(offset/50)+1} 页</span><Button disabled={busy||jobs.length<50} onClick={async()=>setOffset(n=>n+50)}>下一页</Button></div>
  </section>
 </div>;
}
