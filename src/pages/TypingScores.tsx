import {useEffect,useState} from 'react';
import {ShieldCheck, Trophy} from 'lucide-react';
import {api} from '../lib/api';
import '../styles/typing.css';

type Account={id:string;username:string;role:string;active:boolean};
type Row={id:string;mode:'test'|'inspect';time_limit_seconds:number;correct:number;wrong:number;cpm:number;accuracy:number;submitted_at:string};
const roleName=(role:string)=>role==='secondary_admin'?'副管理员':role==='tester'?'测试员':role==='visitor'?'普通用户':role;
const time=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));

export function TypingScores(){
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [selected,setSelected]=useState('');
 const [rows,setRows]=useState<Row[]>([]);
 const [loading,setLoading]=useState(true);
 const [loadingRows,setLoadingRows]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;api<Account[]>('typingScoresUsers').then(list=>{if(!active)return;setAccounts(list);setLoading(false);}).catch(e=>{if(!active)return;setError((e as Error).message);setLoading(false);});return()=>{active=false;};},[]);
 const choose=async(id:string)=>{setSelected(id);setRows([]);setError('');if(!id)return;setLoadingRows(true);try{const data=await api<{rows:Row[]}>('typingScores',{userId:id,offset:0});setRows(data.rows);}catch(e){setError((e as Error).message);}finally{setLoadingRows(false);}};
 const account=accounts.find(a=>a.id===selected);
 return <div className="typing-page"><div className="page-heading"><div><p className="eyebrow"><ShieldCheck size={16}/> 管理员功能</p><h1>查看用户打字成绩</h1><p className="muted">先选择账号，再查看该账号永久保留的打字历史。</p></div></div>
  {error&&<div className="notice error">{error}</div>}
  <section className="card typing-admin-users"><label>选择账号<select value={selected} onChange={e=>void choose(e.target.value)} disabled={loading}><option value="">请选择账号</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.username}（{roleName(a.role)}{a.active?'':' · 已停用'}）</option>)}</select></label>{loading&&<span className="muted">正在读取账号…</span>}</section>
  <section className="card typing-history"><div className="typing-admin-head"><h2><Trophy size={18}/> {account?account.username+' 的打字成绩':'打字成绩'}</h2><span className="muted">共 {rows.length} 条</span></div>
   {!selected?<div className="empty">请选择上方账号。</div>:loadingRows?<div className="empty">正在加载…</div>:rows.length?<div className="typing-table-wrap"><table className="typing-table"><thead><tr><th>提交时间</th><th>模式</th><th>计时</th><th>成绩</th><th>错误</th><th>速度</th><th>正确率</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{time(row.submitted_at)}</td><td>{row.mode==='test'?'测验模式':'检验模式'}</td><td>{Math.round(Number(row.time_limit_seconds)/60)} 分钟</td><td><b>{row.correct}</b></td><td>{row.wrong}</td><td>{Number(row.cpm).toFixed(2)}</td><td>{Number(row.accuracy).toFixed(1)}%</td></tr>)}</tbody></table></div>:<div className="empty">该账号还没有已提交的打字成绩。</div>}
  </section>
 </div>;
}
