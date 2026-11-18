import {Mistakes} from './pages/Mistakes';
import {NavigationDrawer} from './components/NavigationDrawer';
import {prepareNavigation,pageModules} from './lib/page-preload';
import {isTesterRole,canDeleteContent} from '../shared/roles';
import {loginIdError,nicknameError} from '../shared/identity';
import {TesterPage} from './pages/Tester';
import {roleDisplayLabel,roleLabel,testerPreviewPages} from '../shared/roles';
import {LeaderboardRow} from './ui/LeaderboardRow';
import {examStates as labels} from './ui/labels';
import {pageFromHash} from '../shared/navigation';
import {RouteScrollRestore} from '../shared/page-motion';
import {ActionForm} from './ui/ActionForm';
import {Button} from './ui/Button';
import {ToolGuide} from './components/tool-guide/ToolGuide';
import {ReleaseNotes} from './components/ReleaseNotes';
import {useInterfaceLanguage} from './ui/useInterfaceLanguage';
import {PageSurface} from './components/PageSurface';
import {LoadingState} from './components/InteractionLayer';
import {confirmAction,showMessage} from './lib/dialogs';
import { beijingToday } from './lib/time';
const AuditPanel=lazy(()=>import('./ui/AuditPanel').then(m=>({default:m.AuditPanel})));
import {HistoryPage} from './pages/History';
import {Settings} from './pages/Settings';
import {Admin} from './pages/Admin';
import {Typing} from './pages/Typing';
import {Reports} from './pages/Reports';
import {ReportInbox} from './pages/ReportInbox';
import {Files} from './pages/Files';
import {DocumentPage} from './components/DocumentPage';
import {useCallback,useEffect,useLayoutEffect,useState,useRef,lazy,Suspense} from 'react';
import {UsersRound,KeyRound,ListChecks,Trash2,ScrollText,SlidersHorizontal,BookOpen,FilePlus2,FolderOpen,LayoutDashboard,LogOut,Settings as SettingsIcon,Trophy,Menu,X,ShieldCheck,History,FileType2,Keyboard,FileWarning} from 'lucide-react';

import {useAccountPresence} from './lib/presence';
import {api,supabase} from './lib/api';
import {isAuthorizationError} from './lib/api-error';
import {readStoredMaintenance,watchMaintenance,type MaintenanceState} from './lib/maintenance';
import {peekRead,setReadCacheAccount} from './lib/read-cache';
import {prefetchPage,warmPageModules} from './lib/page-preload';
import {initMotionPreference} from './lib/interface-motion';
import {clearAccount,localSave,hasUnsynced} from './lib/offline';
import {currentProfile,expireLocalSession,waitForIdleSignOut} from './lib/session';
import {acceptIdleDeadline,isIdleExpired,sessionId} from './lib/session-idle';
import {useSessionIdle} from './lib/use-session-idle';
import {LoginPassword} from './components/LoginPassword';
import {resetSessionOverlays} from './lib/dialogs';
import {Mango} from './components/Mango';
import {duration} from '../shared/model';
function AdminNavIcon({id}:{id:string}){const icons:Record<string,typeof ShieldCheck>={review:ListChecks,users:UsersRound,invites:KeyRound,grading:ListChecks,trash:Trash2,logs:ScrollText,config:SlidersHorizontal};const Icon=icons[id]??ShieldCheck;return <Icon size={20}/>;}
function Login({onLogin}:{onLogin:(u:any,id:string)=>void}){
 const [register,setRegister]=useState(false),[loginId,setLoginId]=useState(''),[nickname,setNickname]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[invite,setInvite]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <div className="auth-page"><section className="auth-intro"><div className="brand"><Mango profile={{avatar_code:1}}/><span>芒果学社</span></div><h1>学习与复习</h1></section><section className="auth-form card"><PageSurface routeKey={register?'register':'login'}><h2>{register?'创建学习账号':'登录你的账号'}</h2>{register&&<p className="muted">填写密令和昵称，系统自动分配绑定的登录 ID。</p>}<ActionForm onSubmit={async e=>{
  e.preventDefault();setBusy(true);setError('');
  try{
   if(!register){const idProblem=loginIdError(loginId);if(idProblem)throw new Error(idProblem);}
   if(register){
    const nameProblem=nicknameError(nickname);if(nameProblem)throw new Error(nameProblem);
    if(password!==confirm)throw new Error('两次密码不一致');
    await waitForIdleSignOut();const d=await api('register',{nickname,password,invite});if(!d.session){setLoginId(d.registered_id??'');setRegister(false);setPassword('');await showMessage('注册成功。你的登录 ID：'+d.registered_id+'。请使用原密码登录，ID 也可在个人设置中查看。');return;}const result=await supabase.auth.setSession(d.session);const id=sessionId(result.data.session);if(result.error||!id)throw result.error??new Error('注册成功，请重新登录');acceptIdleDeadline(id,d);setPassword('');onLogin(d.profile,id);
   }else{
    await waitForIdleSignOut();const d=await api('login',{loginId,password});const {data,error}=await supabase.auth.setSession(d.session);const id=sessionId(data.session);if(error||!id)throw error??new Error('登录状态无法保存，请重试');acceptIdleDeadline(id,d);setPassword('');onLogin(d.profile,id);
   }
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }}>{!register&&<label>登录 ID<input required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={4} maxLength={64} value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder={register?'输入密令绑定的 ID':'输入登录 ID'} aria-describedby={register?'registration-id-note':undefined}/></label>}{register&&<><small id="registration-id-note">登录 ID 会在注册成功后显示，可在个人设置中查看。</small><label>昵称<input required autoComplete="nickname" maxLength={512} value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="对外显示，可随时修改"/></label></>}{register?<label>密码<input required type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="输入密码"/></label>:<LoginPassword value={password} onChange={setPassword} busy={busy}/>}{register&&<><label>确认密码<input required type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><label>注册密令<input required autoComplete="off" autoCapitalize="none" spellCheck={false} value={invite} onChange={e=>setInvite(e.target.value)}/></label><small>ID 忽略大小写；昵称可重名。密码至少12位，含字母和数字。</small></>}{error&&<div className="notice" role="alert">{error}</div>}<Button className="primary" disabled={busy} type="submit">{busy?'正在处理…':register?'创建账号':'登录'}</Button></ActionForm><Button className="text-button" disabled={busy} onClick={async()=>{setRegister(!register);setPassword('');setConfirm('');setError('');}}>{register?'已有账号？返回登录':'还没有账号？凭密令注册'}</Button></PageSurface></section></div>;
}
export default function App(){const [user,setUser]=useState<any>(null),[loading,setLoading]=useState(true),[page,setPage]=useState('home'),[edit,setEdit]=useState(''),[attempt,setAttempt]=useState(''),[rows,setRows]=useState<any[]>([]),[search,setSearch]=useState(''),[error,setError]=useState(''),[menu,setMenu]=useState(false),[offset,setOffset]=useState(0),[rankExam,setRankExam]=useState(''),[ranking,setRanking]=useState<any[]>([]),[rankLoading,setRankLoading]=useState(false),[listLoading,setListLoading]=useState(false);
 const connection=useAccountPresence(user?.id);const [maintenance,setMaintenance]=useState<MaintenanceState|null>(()=>readStoredMaintenance());useEffect(()=>watchMaintenance(setMaintenance),[]);
 const [pageOrigin,setPageOrigin]=useState<{x:number;y:number}>();
 useEffect(()=>initMotionPreference(),[]);
 useEffect(()=>{if(user&&!user.must_change_password)return warmPageModules();},[user?.id,user?.role,user?.must_change_password]);
 useEffect(()=>{
  if(typeof sessionStorage==='undefined'||sessionStorage.getItem('mango-impersonating')!=='1')return;
  let stopped=false;
  const beat=async()=>{try{
   const r=await fetch('/backend/impersonation/heartbeat',{method:'POST',credentials:'same-origin',headers:{'X-Mango-Requested-With':'1'}});
   if(r.status===401){sessionStorage.removeItem('mango-impersonating');if(!stopped)location.reload();}
  }catch{/* Retry on the next heartbeat. */}};
  void beat();
  const timer=window.setInterval(()=>void beat(),5000);
  return()=>{stopped=true;window.clearInterval(timer);};
 },[]);
 const listRequest=useRef(0),restoreScroll=useRef<number|null>(null),routeNow=useRef({page,edit,attempt});routeNow.current={page,edit,attempt};
 const activeAccount=useRef<string|undefined>(undefined);
 const clearPrivateDisplay=()=>{navigationRequest.current++;setDocumentPayload(null);setPreparedPage(null);listRequest.current++;setRows([]);setRanking([]);setRankExam('');setRankLoading(false);setListLoading(false);setEdit('');setAttempt('');setOffset(0);setSearch('');};
 const pendingRouteScroll=useRef(new RouteScrollRestore());
 const restoreRoutePosition=(ready:boolean)=>pendingRouteScroll.current.restore(()=>window.scrollY,top=>window.scrollTo({top,behavior:'instant'}),ready);
 useLayoutEffect(()=>{const top=restoreScroll.current??0;restoreScroll.current=null;pendingRouteScroll.current.reset(top);restoreRoutePosition(false);const cancel=()=>pendingRouteScroll.current.cancel();const key=(event:KeyboardEvent)=>{if(['Tab','PageDown','PageUp','Home','End','ArrowDown','ArrowUp',' '].includes(event.key))cancel();};window.addEventListener('wheel',cancel,{once:true,passive:true});window.addEventListener('touchstart',cancel,{once:true,passive:true});window.addEventListener('keydown',key);return()=>{cancel();window.removeEventListener('wheel',cancel);window.removeEventListener('touchstart',cancel);window.removeEventListener('keydown',key);};},[page,edit,attempt]);
 useEffect(()=>{if(!menu)return;const sidebar=document.getElementById('workspace-navigation');const workspace=document.querySelector<HTMLElement>('.workspace');const before=document.activeElement as HTMLElement;const old=document.body.style.overflow;document.body.style.overflow='hidden';if(workspace)workspace.inert=true;const controls=()=>Array.from(sidebar?.querySelectorAll<HTMLElement>('a,button')??[]).filter(x=>!x.hasAttribute('disabled')&&x.getClientRects().length>0);controls()[0]?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){navigationRequest.current++;setMenu(false);}if(e.key==='Tab'){const a=controls(),i=a.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&i<=0){e.preventDefault();a.at(-1)?.focus();}else if(!e.shiftKey&&i===a.length-1){e.preventDefault();a[0]?.focus();}}};document.addEventListener('keydown',key);const resize=()=>{};window.addEventListener('resize',resize);return()=>{document.body.style.overflow=old;if(workspace)workspace.inert=false;document.removeEventListener('keydown',key);window.removeEventListener('resize',resize);before?.focus();};},[menu]);

 const [activeSession,setActiveSession]=useState<string>();
 const sessionRef=useRef<string|undefined>(undefined);
 const authRevision=useRef(0);
 const endSession=useCallback(()=>{
  authRevision.current++;
  sessionRef.current=undefined;
  activeAccount.current=undefined;
  setActiveSession(undefined);
  clearPrivateDisplay();
  setReadCacheAccount(undefined);
  resetSessionOverlays();
  setMenu(false);setError('');setLoading(false);setUser(null);
 },[]);
 const expire=useCallback((id:string)=>{
  if(id===sessionRef.current){endSession();void expireLocalSession(id);}
 },[endSession]);
 useSessionIdle(activeSession,expire);

 const restore=(u:any,id:string)=>{
  if(!u||isIdleExpired(id))return;
  sessionRef.current=id;
  setActiveSession(id);
  if(activeAccount.current!==u.id+':'+u.role){clearPrivateDisplay();activeAccount.current=u.id+':'+u.role;}
  setReadCacheAccount(u.id,u.role);setError('');setUser(u);void localSave(u.id,'profile',u).catch(()=>{});
  try{const route=JSON.parse(localStorage.getItem(u.id+':route')??'{}');const hash=pageFromHash(location.hash,u.role);setPage(hash??pageFromHash(route.page??'home',u.role)??'home');setEdit(hash&&hash!==route.page?'':route.edit??'');setAttempt(hash&&hash!==route.page?'':route.attempt??'');}catch{}
 };
 const refreshProfile=async()=>{
  const revision=++authRevision.current;
  try{
   const result=await currentProfile();
   if(revision!==authRevision.current)return;
   if(!result){if(sessionRef.current)endSession();return;}
   if(isIdleExpired(result.id))return;
   if(sessionRef.current===result.id&&activeAccount.current===result.profile.id+':'+result.profile.role){setUser(result.profile);setReadCacheAccount(result.profile.id,result.profile.role);}else restore(result.profile,result.id);
  }catch(e){if(revision===authRevision.current)setError((e as Error).message);}
  finally{if(revision===authRevision.current)setLoading(false);}
 };
 useEffect(()=>{
  void refreshProfile();
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
   if(event==='INITIAL_SESSION')return;
   if(!session){endSession();return;}
   const id=sessionId(session);
   if(id&&isIdleExpired(id)){if(id===sessionRef.current)expire(id);return;}
   if(id&&id!==sessionRef.current){
    const revision=authRevision.current;
    // The SDK auth callback is synchronous. Read the profile after its auth operation releases.
    window.setTimeout(()=>{if(revision===authRevision.current&&id!==sessionRef.current)void refreshProfile();},0);
   }
  });
  const on=()=>{void refreshProfile();};
  window.addEventListener('online',on);window.addEventListener('offline',on);
  return()=>{authRevision.current++;subscription.unsubscribe();window.removeEventListener('online',on);window.removeEventListener('offline',on);};
 },[]);
 useEffect(()=>{if(user)localStorage.setItem(user.id+':route',JSON.stringify({page,edit,attempt}));},[user,page,edit,attempt]);
 useEffect(()=>{const theme=user?.settings?.theme??'system';const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>document.documentElement.dataset.theme=theme==='system'?(media.matches?'dark':'light'):theme;apply();media.addEventListener('change',apply);if(user?.must_change_password)setPage('settings');return()=>media.removeEventListener('change',apply);},[user]);
 const noticeFor=useRef('');useEffect(()=>{if(!user){noticeFor.current='';return;}if(user.id_notice_seen!==false||noticeFor.current===user.id)return;noticeFor.current=user.id;const account=user.id+':'+user.role;void showMessage('你的登录 ID：'+user.login_id+'\n请记住这个 ID，以后使用 ID 和密码登录。你也可以随时在个人设置中查看。').then(async()=>{if(activeAccount.current!==account)return;await api('ackLoginIdNotice');if(activeAccount.current===account)setUser((value:any)=>value?.id===user.id?{...value,id_notice_seen:true}:value);}).catch(()=>{});},[user?.id,user?.id_notice_seen]);
 useInterfaceLanguage(user?.settings?.language);
 const [preparedPage,setPreparedPage]=useState<any>(null);
 const navigationRequest=useRef(0);const [documentPayload,setDocumentPayload]=useState<any>(null);
 const openDocument=async(kind:'editor'|'attempt',id:string,provided?:any)=>{if(activeAccount.current!==user?.id+':'+user?.role)return;const request=++navigationRequest.current,account=activeAccount.current;try{await pageModules[kind].load();const data=provided??await api(kind==='editor'?'getExam':'attempt',{id},sessionRef.current);if(request!==navigationRequest.current||account!==activeAccount.current)return;const anchor=document.querySelector<HTMLElement>('.mobile-menu')?.getBoundingClientRect();if(anchor)setPageOrigin({x:anchor.left+anchor.width/2,y:anchor.top+anchor.height/2});setDocumentPayload({id,kind,data});if(kind==='editor')setEdit(id);else setAttempt(id);}catch(e){if(request===navigationRequest.current&&account===activeAccount.current)setError((e as Error).message);}};
 const nav=async(p:string,push=true)=>{if(!pageFromHash(p,user?.role??''))return;if(activeAccount.current!==user?.id+':'+user?.role)return;const request=++navigationRequest.current,account=activeAccount.current;let initial:any;try{initial=await prepareNavigation(p);}catch(e){if(request===navigationRequest.current&&account===activeAccount.current){setError((e as Error).message);setMenu(false);}return;}if(request!==navigationRequest.current||account!==activeAccount.current)return;if(p===routeNow.current.page&&!routeNow.current.edit&&!routeNow.current.attempt){setMenu(false);if(!push){pendingRouteScroll.current.cancel();window.scrollTo({top:restoreScroll.current??0,behavior:'instant'});restoreScroll.current=null;}return;}const anchor=document.querySelector<HTMLElement>('.mobile-menu')?.getBoundingClientRect();setPageOrigin(anchor?{x:Math.max(20,Math.min(innerWidth-20,anchor.left+anchor.width/2)),y:Math.max(24,Math.min(innerHeight-24,anchor.top+anchor.height/2))}:undefined);prefetchPage(p);routeNow.current={page:p,edit:'',attempt:''};setPreparedPage({page:p,data:initial});setDocumentPayload(null);if(push&&user){history.replaceState({...history.state,scrollY:window.scrollY},'');history.pushState({mangoUser:user.id,mangoPage:p,scrollY:0},'','#'+p);}listRequest.current++;const cached=['exams','mine','rank'].includes(p)?peekRead<any[]>('exams',{mode:p==='mine'?'mine':'public',search:'',offset:0}):undefined;setRows(cached??[]);setListLoading(['exams','mine','rank'].includes(p)&&cached===undefined);setPage(p);setEdit('');setAttempt('');setMenu(false);setSearch('');setOffset(0);setError('');};
 useEffect(()=>{if(!user)return;history.replaceState({mangoUser:user.id,mangoPage:page,scrollY:window.scrollY},'','#'+page);const back=(event:PopStateEvent)=>{if(event.state?.mangoUser!==user.id)return;const target=pageFromHash(event.state?.mangoPage??'',user.role);if(target){restoreScroll.current=event.state.scrollY??0;nav(target,false);}};window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[user?.id]);
 const refresh=()=>{const request=++listRequest.current;if(!user||user.must_change_password)return;if(['exams','mine','rank'].includes(page)){const params={mode:page==='mine'?'mine':'public',search,offset},cached=peekRead<any[]>('exams',params);setRows(cached??[]);setListLoading(cached===undefined);void api('exams',params).then(data=>{if(request===listRequest.current)setRows(data);}).catch(e=>{if(request===listRequest.current){if(isAuthorizationError(e))setRows([]);setError(e.message);}}).finally(()=>{if(request===listRequest.current)setListLoading(false);});}};
 useEffect(()=>{refresh();return()=>{listRequest.current++;};},[page,user,search,offset,edit,attempt]);
 useEffect(()=>{if(!user||page!=='rank'||!rankExam){setRankLoading(false);if(!rankExam)setRanking([]);return;}let active=true,busy=false;const load=async(initial=false)=>{if(busy)return;busy=true;if(initial){const cached=peekRead<any[]>('leaderboard',{version:rankExam,offset});setRanking(cached??[]);setRankLoading(cached===undefined);}try{const result=await api('leaderboard',{version:rankExam,offset});if(active)setRanking(result);}catch(e){if(active){if(isAuthorizationError(e))setRanking([]);setError((e as Error).message);}}finally{busy=false;if(active)setRankLoading(false);}};void load(true);const timer=setInterval(()=>{if(!document.hidden)void load();},15000);return()=>{active=false;clearInterval(timer);};},[page,rankExam,offset,user?.id]);
 if(loading)return <LoadingState label="正在连接芒果学社…"/>;if(!user&&error)return <main><section className="card"><h1>服务器维护中</h1><p>服务器正在维护或添加功能，请稍等预计 5~10 分钟恢复。</p>{maintenance&&<p className="muted">{maintenance.message}</p>}<Button className="primary" onClick={()=>location.reload()}>重新连接</Button></section></main>;if(!user)return <Login onLogin={(profile,id)=>{sessionStorage.removeItem('mango-impersonating');authRevision.current++;restore(profile,id);setLoading(false);}}/>;
 const allItems=[['home','首页',LayoutDashboard],['typing','打字练习',Keyboard],['reports','提交报告',FileWarning],['reportInbox','查看报告',FileWarning],['exams','试卷中心',BookOpen],['create','创建试卷',FilePlus2],['mine','我的试卷',FolderOpen],['history','我的成绩',History],['rank','排行榜',Trophy]] as const;const items=allItems;
 return <div className="app-shell"><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus();}}>跳到主要内容</a>{maintenance&&<div className="maintenance-overlay" role="alertdialog" aria-modal="true" aria-label="服务器维护中"><div className="card"><h1>服务器维护中</h1><p>{maintenance.message}</p>{maintenance.until&&<p className="muted">预计恢复时间：{new Date(maintenance.until).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</p>}<Button className="primary" onClick={()=>location.reload()}>重新连接</Button></div></div>}{typeof sessionStorage!=='undefined'&&sessionStorage.getItem('mango-impersonating')==='1'&&<div className="impersonation-banner" role="status"><span>正在以被授权账号的身份浏览；管理员原会话保留，可随时返回；两个账号会同时保持在线。</span><Button onClick={async()=>{try{const r=await fetch('/backend/impersonation/stop',{method:'POST',credentials:'same-origin',headers:{'X-Mango-Requested-With':'1'}});if(!r.ok)throw Error((await r.json().catch(()=>({}))).error||'返回管理员失败');sessionStorage.removeItem('mango-impersonating');location.assign('/');}catch(e){sessionStorage.removeItem('mango-impersonating');await showMessage((e as Error).message);}}}>返回管理员</Button></div>}{menu&&<Button className="nav-scrim" aria-label="关闭导航" onClick={()=>{navigationRequest.current++;setMenu(false);}}/>}<NavigationDrawer open={menu} page={page} role={user.role} onClose={()=>{navigationRequest.current++;setMenu(false);}} onNavigate={nav} onLogout={async()=>{if(await hasUnsynced(user.id)&&!await confirmAction('此账号仍有未同步内容。退出前请确认已同步或导出备份。'))return;await supabase.auth.signOut();await clearAccount(user.id);setMenu(false);setUser(null);}}/><div className="workspace"><header><Button className="mobile-menu" aria-label={menu?"关闭导航":"展开导航"} aria-expanded={menu} aria-controls="workspace-navigation" onClick={async()=>{if(menu)navigationRequest.current++;setMenu(!menu);}}><Menu/></Button><div className="breadcrumb">学习空间 <span>/</span> {edit?'试卷编辑器':attempt?'在线答卷':items.find(x=>x[0]===page)?.[1]??({shared:'共享档案',convert:'文档转换',mistakes:'错题本',settings:'个人设置',review:'试卷审核',users:'账号管理',invites:'注册密令',grading:'人工批改',trash:'试卷回收站',logs:'操作日志',config:'系统配置'} as any)[page]??'管理中心'}</div><div className="header-right"><ToolGuide/><ReleaseNotes/><span role="status" className={'connection '+(connection==='connected'?'':'offline')}>● {connection==='connected'?'已连接':connection==='checking'?'正在连接':connection==='reconnecting'?'正在重连':'连接未确认'}</span><Button className="profile-button" onClick={async()=>nav('settings')}><span><bdi data-user-content>{user.username}</bdi><small>{roleDisplayLabel(user.role)}</small></span><Mango profile={user}/></Button></div></header><main id="main-content" tabIndex={-1}><PageSurface key={user.id+':'+user.role} beforeReveal={restoreRoutePosition} origin={pageOrigin} routeKey={[user.id,page,edit,attempt].join(":")}>{error&&<div className="notice error" role="alert">{error}</div>}{isTesterRole(user.role)&&!edit&&!attempt&&testerPreviewPages.has(page)?<TesterPage key={page} page={page} role={user.role}/>:edit?<DocumentPage key={activeSession} kind="editor" initialData={documentPayload?.kind==='editor'&&documentPayload.id===edit?documentPayload.data:undefined} id={edit} user={user} authSession={activeSession} onClose={()=>{setEdit('');nav('mine');}}/>:attempt?<DocumentPage key={activeSession} kind="attempt" initialData={documentPayload?.kind==='attempt'&&documentPayload.id===attempt?documentPayload.data:undefined} id={attempt} user={user} authSession={activeSession} onClose={()=>{setAttempt('');refresh();}} onRedo={(id)=>void openDocument('attempt',id)}/>:page==='mistakes'?<Mistakes initial={preparedPage?.page==='mistakes'?preparedPage.data:undefined} key={user.id+':'+user.role} onOpen={id=>void openDocument('attempt',id)}/>:page==='settings'?<Settings user={user} onUpdate={u=>{if(activeAccount.current!==u.id+':'+u.role)return;setUser(u);void localSave(u.id,'profile',u).catch(()=>{});}}/>:page==='typing'?<Typing user={user}/>:page==='reports'?<Reports/>:page==='reportInbox'?<ReportInbox/>:page==='shared'||page==='convert'?<Files key={page} user={user} convert={page==='convert'}/>:['review','users','invites','trash','logs','config'].includes(page)?<Admin role={user.role} initialRows={preparedPage?.page===page?preparedPage.data?.rows:undefined} key={page} mode={page} onEdit={id=>void openDocument('editor',id)}/>:page==='create'?<div className="create-layout"><section className="card create-card"><h1>创建一份新试卷</h1><ActionForm onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget);try{const exam=await api('createExam',{title:form.get('title')});await openDocument('editor',exam.id,exam);}catch(e){setError((e as Error).message);}}}><label>试卷名称<input name="title" required maxLength={200} autoFocus placeholder="例如：数学 · 第一章复习"/></label><Button className="primary" type="submit">创建并开始编辑 </Button></ActionForm></section></div>:<>{page==='home'?<><div className="page-heading"><div><h1>你好，<bdi data-user-content>{user.username}</bdi> <span className="wave">✦</span></h1></div><span className="date-label">{beijingToday()}</span></div><div className="quick-grid"><Button className="card quick-card" onClick={async()=>nav('exams')}><BookOpen/><div><h3>开始复习</h3></div></Button><Button className="card quick-card" onClick={async()=>nav('mine')}><FolderOpen/><div><h3>继续创作</h3></div></Button><Button className="card quick-card" onClick={async()=>nav('history')}><History/><div><h3>回顾进步</h3></div></Button></div><div className="tool-links"><Button onClick={async()=>nav('shared')}><FolderOpen size={17}/>共享档案</Button><Button onClick={async()=>nav('convert')}><FileType2 size={17}/>文档转换</Button></div></>:<><div className="page-heading"><div><h1>{page==='mine'?'我的试卷':page==='history'?'我的成绩':page==='grading'?'全站答卷与批改':page==='rank'?'试卷排行榜':'试卷中心'}</h1>{page==='rank'&&<p>分数优先，同分用时短者优先。</p>}</div>{page==='mine'&&<Button className="primary" onClick={async()=>nav('create')}>＋ 创建试卷</Button>}</div>{['exams','mine'].includes(page)&&<input className="search" placeholder="搜索试卷名称" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/>}{page==='rank'?<><select aria-label="选择排行榜试卷" value={rankExam} onChange={e=>{setRankExam(e.target.value);setOffset(0);}}><option value="">选择一份已发布试卷</option>{rows.map(r=><option key={r.id} value={r.published_version_id}>{r.title}</option>)}</select>{<div className="ranking-list data-region" aria-busy={rankLoading} data-page-pending={rankLoading}>{rankExam&&<div className="rank-header"><span>名次</span><span>用户</span><span>分数</span><span>用时</span></div>}{ranking.map((r,i)=><LeaderboardRow key={r.key??i} row={r} currentProfile={user}/>)}</div>}{rankExam&&!rankLoading&&!ranking.length&&!error&&<div className="empty">本试卷还没有最终成绩</div>}</>:['history','grading'].includes(page)?<HistoryPage all={page==='grading'} onOpen={id=>void openDocument('attempt',id)} onRedo={id=>void openDocument('attempt',id)}/>:<div className="exam-list data-region" aria-busy={listLoading} data-page-pending={listLoading}>{rows.map(r=><article className="card exam-card" key={r.id}><div className="exam-icon"><BookOpen size={25}/></div><div><span className="badge">{r.subject||'综合'} · {labels[r.status]}</span><h3 data-user-content>{r.title}</h3>{r.description&&<p>{r.description}</p>}<small>{r.time_limit?duration(r.time_limit)+' 限时':'不限时 · 记录真实用时'}{r.review_reason&&' · 退回原因：'+r.review_reason}{r.author&&' · 作者：'+r.author}</small></div><div className="actions">{page==='mine'?<><Button className="primary" onClick={async()=>openDocument('editor',r.id)}>继续编辑</Button>{canDeleteContent(user.role)&&<Button onClick={async()=>{if(await confirmAction('移入回收站？')){await api('deleteExam',{id:r.id,revision:r.revision});refresh();}}}>删除</Button>}</>:<Button className="primary" onClick={async()=>{try{const d=await api('startAttempt',{id:r.id});await openDocument('attempt',d.attempt.id,d);}catch(e){setError((e as Error).message);}}}>开始答题</Button>}</div></article>)}{!listLoading&&!rows.length&&!error&&<div className="card empty"><BookOpen size={40}/><h3>暂无试卷</h3></div>}</div>}{!['history','grading'].includes(page)&&<div className="pagination"><Button disabled={!offset} onClick={async()=>setOffset(n=>Math.max(0,n-50))}>上一页</Button><span>第 {offset/50+1} 页</span><Button disabled={(page==='rank'?ranking:rows).length<50} onClick={async()=>setOffset(n=>n+50)}>下一页</Button></div>}</>}</>}</PageSurface></main></div>{new URLSearchParams(location.search).has('ui-audit')&&<Suspense fallback={null}><AuditPanel/></Suspense>}</div>;
}
