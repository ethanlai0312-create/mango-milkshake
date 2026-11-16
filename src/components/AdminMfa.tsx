import {useEffect,useState} from 'react';
import {supabase} from '../lib/api';
import {readAdminFactors,verifyAdminFactor,type AdminFactor} from '../lib/admin-mfa';
import {Button} from '../ui/Button';

type Enrollment={id:string;secret:string};

export function AdminMfa({gate=false,onVerified}:{gate?:boolean;onVerified?:()=>void}){
 const [factors,setFactors]=useState<AdminFactor[]>([]);
 const [factor,setFactor]=useState('');
 const [enrollment,setEnrollment]=useState<Enrollment>();
 const [code,setCode]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [loaded,setLoaded]=useState(false);
 async function reload(){
  const list=await readAdminFactors();
  setFactors(list);setFactor(list[0]?.id??'');setLoaded(true);
 }
 useEffect(()=>{void reload().catch(e=>setError(e.message));},[]);
 async function perform(action:()=>Promise<void>){
  setBusy(true);setError('');
  try{await action();}catch(e){setError((e as Error).message);}
  finally{setCode('');setBusy(false);}
 }
 return <section className="card settings-security">
  <h2>管理员双重验证</h2>
  {gate&&<p>请先验证身份，再进入网站。</p>}
  {error&&<p role="alert">{error}</p>}
  {!loaded&&<Button onClick={()=>perform(reload)} disabled={busy}>重新读取验证器</Button>}
  {!gate&&loaded&&<p>已验证的验证器 {factors.length} 个。请在两个独立设备各绑定一个，以便恢复。</p>}
  {!gate&&loaded&&!enrollment&&factors.length<2&&<Button disabled={busy} onClick={()=>perform(async()=>{
   const {data,error}=await supabase.auth.mfa.enroll({
    factorType:'totp',issuer:'芒果学社',friendlyName:'芒果学社 '+new Date().toISOString(),
   });
   if(error)throw new Error('无法建立验证器，请重试');
   setEnrollment({id:data.id,secret:data.totp.secret});
  })}>绑定验证器</Button>}
  {enrollment&&<p>在验证器手动添加基于时间的账号，输入密钥 <code>{enrollment.secret}</code>。</p>}
  {(enrollment||(gate&&factor))&&<form onSubmit={event=>{
   event.preventDefault();
   if(busy)return;
   void perform(async()=>{
    await verifyAdminFactor(enrollment?.id??factor,code.trim());
    setEnrollment(undefined);
    if(!gate)await reload();
    onVerified?.();
   });
  }}>
   {gate&&factors.length>1&&<label>验证器<select value={factor} onChange={event=>setFactor(event.target.value)}>
    {factors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
   </select></label>}
   <label>六位验证码<input value={code} onChange={event=>setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required/></label>
   <Button type="submit" className="primary" disabled={busy}>验证</Button>
  </form>}
  {gate&&loaded&&!factor&&<p>此账号没有可用验证器，请通过服务器管理员恢复。</p>}
  {gate&&<Button disabled={busy} onClick={()=>perform(async()=>{
   const {error}=await supabase.auth.signOut({scope:'local'});
   if(error)throw error;
  })}>退出登录</Button>}
 </section>;
}

