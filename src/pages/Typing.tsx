import {useEffect,useMemo,useRef,useState} from 'react';
import {Keyboard, TimerReset, Trophy, WifiOff} from 'lucide-react';
import {Button} from '../ui/Button';
import {TypingScores} from './TypingScores';
import {api,serverNow} from '../lib/api';
import {calculateTypingScore,normalizeTypedText,quickCode,TYPING_MAX_CHARS,TYPING_TIME_OPTIONS,type RootType,type TypingMode} from '../../shared/typing';
import rootMap from '../data/typing-cangjie.json';
import '../styles/typing.css';

type Attempt={id:string;mode:TypingMode;root_type:RootType;time_limit_seconds:number;target_text:string;started_at:string;submitted_at?:string|null;typed_text?:string};
type Score={attempted:number;minutes:number;correct:number;wrong:number;accuracy:number;cpm:number};
type HistoryRow=Score&{id:string;mode:TypingMode;root_type:RootType;time_limit_seconds:number;started_at:string;submitted_at:string};
const roots=rootMap as Record<string,string>;
const draftKey=(id:string)=>'mango-typing-draft:'+id;
const pendingKey=(id:string)=>'mango-typing-pending:'+id;
const historyTime=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
const modeLabel=(mode:TypingMode)=>mode==='test'?'测验模式':'检验模式';
const scoreOf=(row:any):Score=>({attempted:Number(row.attempted??0),minutes:Number(row.time_limit_seconds??300)/60,correct:Number(row.correct??0),wrong:Number(row.wrong??0),accuracy:Number(row.accuracy??0),cpm:Number(row.cpm??0)});

export function Typing({user}:{user:{id:string;role:string}}){
 const [mode,setMode]=useState<TypingMode>('test');
 const [minutes,setMinutes]=useState<5|10>(5);
 const [rootType,setRootType]=useState<RootType>('cangjie');
 const [attempt,setAttempt]=useState<Attempt|null>(null);
 const [target,setTarget]=useState('');
 const [typed,setTyped]=useState('');
 const [phase,setPhase]=useState<'idle'|'playing'|'finished'>('idle');
 const [remaining,setRemaining]=useState(300);
 const [result,setResult]=useState<Score|null>(null);
 const [history,setHistory]=useState<HistoryRow[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [online,setOnline]=useState(()=>typeof navigator==='undefined'?true:navigator.onLine);
 const [pendingCount,setPendingCount]=useState(0);
 const typedRef=useRef('');
 const phaseRef=useRef<'idle'|'playing'|'finished'>('idle');
 const attemptRef=useRef<Attempt|null>(null);
 typedRef.current=typed;phaseRef.current=phase;attemptRef.current=attempt;

 const loadHistory=async()=>{try{setHistory(await api<HistoryRow[]>('typingHistory',{offset:0}));}catch{/* offline: keep current history */}};
 const saveDraft=()=>{if(!attempt||phaseRef.current==='finished')return;try{localStorage.setItem(draftKey(user.id),JSON.stringify({attempt,typed:typedRef.current,rootType}));}catch{}};
 const clearDraft=()=>{try{localStorage.removeItem(draftKey(user.id));}catch{}};

 const queuePending=(a:Attempt,value:string)=>{try{const old=JSON.parse(localStorage.getItem(pendingKey(user.id))??'[]');const next=Array.isArray(old)?old.filter((x:any)=>x.id!==a.id):[];next.push({id:a.id,typed:value});localStorage.setItem(pendingKey(user.id),JSON.stringify(next));setPendingCount(next.length);}catch{/* ignore */}};
 const flushPending=async()=>{let list:any[]=[];try{list=JSON.parse(localStorage.getItem(pendingKey(user.id))??'[]');}catch{}if(!Array.isArray(list)||!list.length){setPendingCount(0);return;}const left=[];for(const item of list){try{await api('submitTyping',{id:item.id,typed:item.typed});}catch{left.push(item);}}try{localStorage.setItem(pendingKey(user.id),JSON.stringify(left));}catch{}setPendingCount(left.length);if(!left.length)await loadHistory();};

 useEffect(()=>{void loadHistory();void flushPending();const on=()=>{setOnline(true);void flushPending();};const off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};},[user.id]);

 useEffect(()=>{
  let cancelled=false;
  const restore=async()=>{
   let draft:any=null;try{draft=JSON.parse(localStorage.getItem(draftKey(user.id))??'null');}catch{}
   if(!draft?.attempt?.id)return;
   try{const saved=await api<{attempt:Attempt}>('typingAttempt',{id:draft.attempt.id});if(cancelled)return;const a=saved.attempt;if(a.submitted_at){clearDraft();return;}const deadline=Date.parse(a.started_at)+Number(a.time_limit_seconds)*1000;if(Date.now()>=deadline){setAttempt(a);setTarget(a.target_text);setTyped(draft.typed??'');setPhase('finished');setResult(calculateTypingScore(a.target_text,draft.typed??'',a.time_limit_seconds));clearDraft();queuePending(a,draft.typed??'');return;}setAttempt(a);setTarget(a.target_text);setTyped(draft.typed??'');setMode(a.mode);setRootType(a.root_type);setMinutes(a.time_limit_seconds===600?10:5);setPhase('playing');setRemaining(Math.max(0,Math.floor((deadline-Date.now())/1000)));saveDraft();}catch{/* keep draft until connection returns */}
  };
  void restore();
  return()=>{cancelled=true;};
 },[user.id]);

 useEffect(()=>{
  if(phase!=='playing'||!attempt)return;
  const deadline=Date.parse(attempt.started_at)+Number(attempt.time_limit_seconds)*1000;
  const tick=()=>{const left=Math.max(0,Math.ceil((deadline-serverNow())/1000));setRemaining(left);if(left<=0)void finish('时间到');};
  tick();const timer=window.setInterval(tick,250);return()=>window.clearInterval(timer);
 },[phase,attempt]);

 useEffect(()=>{if(phase==='playing')saveDraft();},[typed]);

 const start=async()=>{
  setError('');setBusy(true);
  try{
   const data=await api<{attempt:Attempt}>('startTyping',{mode,rootType,minutes});
   const a=data.attempt;setAttempt(a);setTarget(a.target_text);setTyped('');setResult(null);setPhase('playing');setRemaining(Number(a.time_limit_seconds));setOnline(navigator.onLine);setTimeout(saveDraft,0);
  }catch{setError('无法开始，请检查网络后重试。');}finally{setBusy(false);}
 };

 const finish=async(reason:string)=>{
  if(phaseRef.current!=='playing')return;
  const a=attemptRef.current;if(!a)return;
  const value=typedRef.current;
  const local=calculateTypingScore(a.target_text,value,a.time_limit_seconds);
  setPhase('finished');setResult(local);setError('');clearDraft();
  try{const saved=await api<{attempt:any}>('submitTyping',{id:a.id,typed:value});const row=saved.attempt;setResult(scoreOf(row));void loadHistory();}
  catch{queuePending(a,value);setError(reason==='时间到'?'时间到，成绩已保存在本机，联网后会自动提交。':'当前网络不可用，成绩已保存在本机，联网后会自动提交。');}
 };

 const reset=()=>{setAttempt(null);setTarget('');setTyped('');setResult(null);setPhase('idle');setError('');setRemaining(Number(minutes)*60);clearDraft();};
 const changeMode=(value:TypingMode)=>{if(phase==='playing')return;setMode(value);};
 const changeMinutes=(value:5|10)=>{if(phase==='playing')return;setMinutes(value);setRemaining(value*60);};
 const changeRoot=(value:RootType)=>{if(phase==='playing')return;setRootType(value);};

 const nextChar=target[typed.length]??'';
 const code=nextChar?roots[nextChar]??'':'';const shownCode=rootType==='quick'?quickCode(code):code;
 const progress=target.length?Math.min(100,typed.length/target.length*100):0;
 const targetChars=useMemo(()=>Array.from(target),[target]);
 const typedChars=useMemo(()=>Array.from(typed),[typed]);

 const block=(e:{preventDefault:()=>void})=>e.preventDefault();
 return <div className="typing-page">
  <div className="page-heading"><div><p className="eyebrow"><Keyboard size={16}/> 打字练习</p><h1>仓颉 · 速成打字</h1><p className="muted">照学校打字程序规则：随机成语组题，5 或 10 分钟，正确字数为成绩，速度按设定时长计算。</p></div><div className="typing-status"><span className={online?'connection':'connection offline'}>{online?'在线':'离线'} </span>{phase==='playing'&&<span><TimerReset size={15}/>{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</span>}</div></div>
  {!online&&<div className="notice">当前离线。正在进行的成绩会先保存在本机，恢复网络后自动提交。</div>}
  {pendingCount>0&&<div className="notice">有 {pendingCount} 条离线成绩等待提交，联网后会自动补交。</div>}
  {error&&<div className="notice error">{error}</div>}
  <section className="card typing-controls">
   <div className="typing-segment"><span>模式</span><button className={mode==='test'?'active':''} onClick={()=>changeMode('test')} disabled={phase==='playing'}>测验模式</button><button className={mode==='inspect'?'active':''} onClick={()=>changeMode('inspect')} disabled={phase==='playing'}>检验模式</button></div>
   <label>时间限制<select value={minutes} disabled={phase==='playing'} onChange={e=>changeMinutes(Number(e.target.value) as 5|10)}>{TYPING_TIME_OPTIONS.map(m=><option key={m} value={m}>{m} 分钟</option>)}</select></label>
   <label>字根显示<select value={rootType} disabled={phase==='playing'} onChange={e=>changeRoot(e.target.value as RootType)}><option value="cangjie">仓颉</option><option value="quick">速成</option></select></label>
   <div className="typing-start-actions">{phase==='idle'?<Button className="primary" disabled={busy} onClick={()=>void start()}>{busy?'正在准备…':'开始'}</Button>:phase==='playing'?<Button className="danger" onClick={()=>void finish('提前结束')}>结束并提交</Button>:<Button className="primary" onClick={reset}>再来一次</Button>}</div>
  </section>
  <section className="card typing-work">
   <div className="typing-meta"><span>{modeLabel(mode)}</span><span>{minutes} 分钟</span><span>{rootType==='cangjie'?'仓颉':'速成'}字根</span>{attempt&&<span>本次：{typed.length}/{TYPING_MAX_CHARS} 字</span>}</div>
   {phase==='idle'&&!attempt?<div className="typing-empty"><Keyboard size={42}/><h2>点击“开始”直接出题</h2><p>不需要先载入题目，也不需要填学号姓名。</p><p className="muted">测验模式不显示字根；检验模式显示下一字字根。</p></div>:<>
    <div className="typing-source" aria-label="题目文字">{targetChars.map((ch,i)=><span key={i} className={i<typedChars.length?(typedChars[i]===ch?'typing-char correct':'typing-char wrong'):i===typedChars.length?'typing-char current':'typing-char'}>{ch}</span>)}</div>
    <textarea className="typing-input" value={typed} disabled={phase!=='playing'} autoFocus placeholder={phase==='playing'?'在此输入…':phase==='finished'?'已提交':'点击开始后在这里输入'} onChange={e=>setTyped(e.target.value)} onPaste={block} onDrop={block} onCopy={block} onCut={block} onContextMenu={block} onKeyDown={e=>{if(e.ctrlKey||e.metaKey){if(['c','v','x'].includes(e.key.toLowerCase()))e.preventDefault();}}} spellCheck={false} autoComplete="off"/>
    <div className="typing-progress"><i style={{width:progress+'%'}}/></div>
    {phase==='playing'&&mode==='inspect'&&<div className="typing-root">{nextChar?<>下一个字：<b>{nextChar}</b> · {rootType==='cangjie'?'仓颉':'速成'}码 <code>{shownCode||'—'}</code></>:<span>已完成全部输入，可以提交。</span>}</div>}
    {phase==='finished'&&result&&<div className="typing-result"><div><small>最终成绩</small><strong>{result.correct}</strong><span>正确字</span></div><div><small>错误</small><strong>{result.wrong}</strong><span>字</span></div><div><small>正确率</small><strong>{Number(result.accuracy).toFixed(1)}%</strong></div><div><small>速度</small><strong>{Number(result.cpm).toFixed(2)}</strong><span>字/分</span></div><div><small>计时</small><strong>{Number(result.minutes).toFixed(0)}</strong><span>分钟</span></div></div>}
   </>}
  </section>
  <section className="card typing-history"><div className="typing-history-head"><h2><Trophy size={18}/> 我的打字历史</h2><span className="muted">永久保存</span></div>{history.length?<div className="typing-table-wrap"><table className="typing-table"><thead><tr><th>提交时间</th><th>模式</th><th>计时</th><th>成绩</th><th>错误</th><th>速度</th><th>正确率</th></tr></thead><tbody>{history.map(row=><tr key={row.id}><td data-label="提交时间">{historyTime(row.submitted_at)}</td><td data-label="模式">{modeLabel(row.mode)}</td><td data-label="计时">{Math.round(Number(row.time_limit_seconds)/60)} 分钟</td><td data-label="成绩"><b>{row.correct}</b></td><td data-label="错误">{row.wrong}</td><td data-label="速度">{Number(row.cpm).toFixed(2)}</td><td data-label="正确率">{Number(row.accuracy).toFixed(1)}%</td></tr>)}</tbody></table></div>:<div className="empty">还没有打字记录，开始一次测验吧。</div>}</section>
  {(user.role==='admin'||user.role==='secondary_admin')&&<TypingScores embedded/>}
 </div>;
}
