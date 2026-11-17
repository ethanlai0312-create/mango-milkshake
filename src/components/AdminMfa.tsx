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
  <details><summary>如何使用验证器</summary><ol><li>在手机安装支持 TOTP 的验证器应用。</li><li>点击“绑定验证器”，在应用中添加账号，选择“输入设置密钥”。</li><li>名称填写“芒果学社 admin”，粘贴下方密钥，类型选择“基于时间”。</li><li>把应用生成的六位数字填回网站，点击“验证”。以后重要操作输入应用当前显示的验证码。</li></ol><p>这不是登录密码或短信验证码。请勿向他人发送密钥；验证码不正确时检查手机的自动日期与时间。</p></details>
  {gate&&<p>请先验证身份，再进入网站。</p>}
  {error&&<p role="alert">{error}</p>}
  {!loaded&&<Button onClick={()=>perform(reload)} disabled={busy}>重新读取验证器</Button>}
  {!gate&&loaded&&<p>已验证的验证器 {factors.length} 个。请在两个独立设备各绑定一个，以便恢复。</p>}
  {loaded&&(!gate||factors.length===0)&&!enrollment&&factors.length<2&&<Button disabled={busy} onClick={()=>perform(async()=>{
   const {data,error}=await supabase.auth.mfa.enroll({
    factorType:'totp',issuer:'芒果学社',friendlyName:'芒果学社 '+new Date().toISOString(),
   });
   if(error)throw new Error('无法建立验证器，请重试');
   setEnrollment({id:data.id,secret:data.totp.secret});
  })}>绑定验证器</Button>}
  {enrollment&&<div><p>将此密钥添加到验证器，类型选择“基于时间”。</p><p><code className="mfa-secret">{enrollment.secret}</code></p><Button type="button" disabled={busy} onClick={()=>perform(async()=>{await navigator.clipboard.writeText(enrollment.secret);})}>复制设置密钥</Button><p>添加后，在下方输入应用生成的六位数字。</p></div>}
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
  {gate&&loaded&&!factor&&<p>首次使用请先绑定验证器。完成六位验证码验证后，才能进入管理功能。</p>}
  {gate&&<Button disabled={busy} onClick={()=>perform(async()=>{
   const {error}=await supabase.auth.signOut({scope:'local'});
   if(error)throw error;
  })}>退出登录</Button>}
 </section>;
}

