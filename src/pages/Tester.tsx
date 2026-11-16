import {useEffect,useRef,useState} from 'react';
import {api,supabase} from '../lib/api';
import {Button} from '../ui/Button';
import {Files} from './Files';
import {QuestionAnswer} from '../components/QuestionAnswer';
import {newQuestion,kinds} from '../../shared/model';

/** Tester has an independent read-only view; no Editor or Attempt is mounted. */
export function TesterPage({user,page,onNavigate,onUpdate}:{user:any;page:string;onNavigate:(page:string)=>void;onUpdate:(user:any)=>void}){
 const [rows,setRows]=useState<any[]>([]),[exam,setExam]=useState<any>(),[selected,setSelected]=useState(0),[error,setError]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[loading,setLoading]=useState(false);
 const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0);
 useEffect(()=>{const request=++generation.current;setRows([]);setExam(undefined);setError('');setSelected(0);
  if(page!=='exams'){setLoading(false);return;}
  setLoading(true);void api('exams',{mode:'public',search,offset}).then(rows=>{if(request===generation.current)setRows(rows);}).catch(e=>{if(request===generation.current)setError(e.message);}).finally(()=>{if(request===generation.current)setLoading(false);});
  return()=>{generation.current++;};
 },[page,search,offset,user.id]);
 if(page==='shared')return <Files user={user}/>;
 if(page==='settings')return <div className="settings-page"><h1>个人设置</h1><section className="card settings-security"><h2>修改密码</h2><p>{user.username} · tester</p><label>当前密码<input type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>新密码<input type="password" autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)}/></label><Button className="primary" onClick={async()=>{const result=await api('changePassword',{currentPassword:current,newPassword:next});await supabase.auth.setSession(result.session);onUpdate(await api('me'));setCurrent('');setNext('');setMessage('密码已修改');}}>修改密码</Button>{message&&<p role="status">{message}</p>}</section></div>;
 if(page!=='exams')return <div><h1>你好，{user.username}</h1><p>tester · 只读测试</p><div className="actions"><Button onClick={()=>onNavigate('exams')}>查看已发布试卷</Button><Button onClick={()=>onNavigate('shared')}>共享档案</Button></div></div>;
 const question=exam?.questions[selected];
 return <div><div className="page-heading"><h1>{exam?.title??'试卷中心'}</h1><span className="badge">tester · 只读</span></div>{error&&<p className="notice error" role="alert">{error}</p>}
  {exam?<><Button onClick={()=>{generation.current++;setExam(undefined);}}>返回试卷列表</Button><div className="attempt-grid"><aside className="card"><div className="number-grid">{exam.questions.map((q:any,i:number)=><Button key={q.id} onClick={()=>setSelected(i)} className={i===selected?'active':''}>{i+1}</Button>)}</div></aside><section className="card">{question&&<><h2>第 {selected+1} 题 · {kinds[question.kind as keyof typeof kinds]}</h2><QuestionAnswer q={{...newQuestion(question.kind),...question,answer:undefined}} value={undefined} readOnly onChange={()=>{}}/></>}</section></div></>:
  <><input className="search" aria-label="搜索已发布试卷" placeholder="搜索已发布试卷" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/><div className="exam-list" aria-busy={loading}>{rows.map(row=><article className="card exam-card" key={row.id}><div><h3>{row.title}</h3><p>{row.subject}</p></div><div className="actions"><Button onClick={async()=>{const request=++generation.current;try{const data=await api('testerExam',{id:row.id});if(request===generation.current){setExam(data);setSelected(0);}}catch(e){if(request===generation.current)setError((e as Error).message);}}}>查看试卷</Button></div></article>)}{!loading&&!rows.length&&<p className="empty">暂无已发布试卷</p>}</div><div className="pagination"><Button disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-50))}>上一页</Button><Button disabled={rows.length<50} onClick={()=>setOffset(n=>n+50)}>下一页</Button></div></>}
 </div>;
}
