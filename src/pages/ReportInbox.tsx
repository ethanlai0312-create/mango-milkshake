import {useEffect,useState} from 'react';
import {CheckCircle2,Clock3,FileWarning,Inbox} from 'lucide-react';
import {ReportThread,type ReportThreadData} from '../components/ReportThread';
import {api} from '../lib/api';
import '../styles/reports.css';
const time=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
type Row=ReportThreadData&{submitter:string};
export function ReportInbox(){
 const [filter,setFilter]=useState<'all'|'unread'|'read'>('all'),[rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=async()=>{setLoading(true);setError('');try{setRows(await api<Row[]>('reportInbox',{filter,offset:0}));}catch(e){setError((e as Error).message);}finally{setLoading(false);}};
 useEffect(()=>{void load();},[filter]);
 if(selected)return <ReportThread id={selected} admin onBack={()=>{setSelected('');void load();}}/>;
 return <div className="reports-page"><div className="page-heading"><div><p className="eyebrow"><Inbox size={16}/> 管理员功能</p><h1>查看报告</h1><p className="muted">所有提交按时间排序；打开即记为主管理员已阅，回复后提交人可看到回复。</p></div></div>
  {error&&<div className="notice error">{error}</div>}
  <div className="report-filters" role="group" aria-label="按阅读状态筛选"><button type="button" className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>全部</button><button type="button" className={filter==='unread'?'active':''} onClick={()=>setFilter('unread')}>未阅</button><button type="button" className={filter==='read'?'active':''} onClick={()=>setFilter('read')}>已阅</button></div>
  <section className="card report-history"><div className="report-history-head"><h2><FileWarning size={18}/> 报告历史</h2><span className="muted">按提交时间，不按账号排序</span></div>
   {loading?<div className="empty">正在读取报告…</div>:rows.length?<div className="report-list">{rows.map(row=><button type="button" key={row.id} className="report-row" onClick={()=>setSelected(row.id)}><span className="report-row-main"><b>{row.submitter}</b><small>{row.level1}{row.level2&&row.level2!=='不指定二级菜单'?' · '+row.level2:''} · {time(row.submitted_at)}</small></span><span className={'report-status '+(row.read?'read':'unread')}>{row.read?<CheckCircle2 size={14}/>:<Clock3 size={14}/>}<i className="result-dot"/>{row.read?'已阅':'未阅'}</span></button>)}</div>:<div className="empty">没有符合筛选条件的报告。</div>}
  </section>
 </div>;
}
