import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import './mango-avatar.css';

/* The crown shares the fruit's warm outline and stays inside its 80-unit artboard. */
function Crown(){
 return <g className="mango-crown" fill="#efbc50" stroke="#583d28" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M26 11 L34 16 L41 5 L48 16 L56 11 L53 26 Q41 30 29 26 Z"/>
  <path d="M30 23 Q41 26 52 23" fill="none" strokeWidth="1.8"/>
  <path d="M40 15 L42 15 L43 18 L41 20 L39 18 Z" fill="#fff0bd" stroke="none"/>
 </g>;
}

export function Mango({profile,size=42}:{profile:any;size?:number}){
 const code=Number(profile?.avatar_code??0),[picture,setPicture]=useState({path:'',url:''});
 const photo=picture.path===profile?.avatar_path?picture.url:'';
 const admin=profile?.role==='admin';
 useEffect(()=>{
  let disposed=false;
  setPicture({path:profile?.avatar_path??'',url:''});
  const refresh=async()=>{
   if(profile?.avatar_path)try{
    const d=await api('fileUrl',{id:profile.avatar_path});
    if(!disposed)setPicture({path:profile.avatar_path,url:d.signedUrl});
   }catch{/* Keep the last loaded picture through transient network failures. */}
  };
  void refresh();
  const timer=setInterval(()=>{if(!document.hidden)void refresh();},45000);
  const visible=()=>{if(!document.hidden)void refresh();};
  document.addEventListener('visibilitychange',visible);
  return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[profile?.avatar_path]);
 const color=profile?.avatar?.color??`hsl(${35+code%14} 95% 65%)`;
 const hat=profile?.avatar?.hat??(['none','cap','bow','flower'][code%4]);
 const avatarLabel=admin?'系统管理员芒果头像':'芒果头像';
 return <span className={'mango-avatar '+(admin?'mango-avatar--admin':'mango-avatar--guest')+(photo?' mango-avatar--photo':'')} style={{width:size,height:size}} title={admin?'系统管理员':'专属芒果 #'+code}>
  {photo?<>
   <img className="mango-photo" alt={admin?'系统管理员个人头像':'个人头像'} src={photo} onError={()=>setPicture(current=>current.path===profile?.avatar_path?{...current,url:''}:current)}/>
   {admin&&<svg className="mango-avatar-art mango-crown-overlay" viewBox="0 0 80 80" width={size} height={size} aria-hidden="true"><Crown/></svg>}
  </>:<svg className="mango-avatar-art" viewBox="0 0 80 80" width={size} height={size} role="img" aria-label={avatarLabel}>
   <g transform={admin?'translate(4 8) scale(.9)':undefined}>
    <path d="M44 17 Q50 1 65 9 Q60 22 44 20" fill="#4e9674"/>
    <path d="M39 15 C12 13 12 53 25 67 C39 83 65 62 67 39 C69 17 54 11 39 15" fill={color}/>
    <g stroke="#583d28" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
     <path d="M26 36 Q32 31 36 36 M48 36 Q54 31 58 36"/>
     <path d={profile?.avatar?.expression==='surprise'?'M39 48 a5 6 0 1 0 1 0':'M35 46 Q42 56 51 44'}/>
    </g>
    {(profile?.avatar?.glasses??code%3===0)&&<g stroke="#263a49" strokeWidth="2" fill="none"><circle cx="31" cy="35" r="9"/><circle cx="53" cy="35" r="9"/><path d="M40 35h4"/></g>}
    {hat==='cap'&&<path d="M20 23 Q24 5 45 8 Q58 9 62 24 L14 26Z" fill="#7296b1"/>}
    {hat==='bow'&&<path d="M39 19 L24 8 L24 27 L39 19 L55 8 L55 27Z" fill="#d98e9d"/>}
    {hat==='flower'&&<g fill="#de86a4" transform="translate(27 18)"><ellipse cy="-6" rx="4" ry="6"/><ellipse cy="-6" rx="4" ry="6" transform="rotate(72)"/><ellipse cy="-6" rx="4" ry="6" transform="rotate(144)"/><ellipse cy="-6" rx="4" ry="6" transform="rotate(216)"/><ellipse cy="-6" rx="4" ry="6" transform="rotate(288)"/><circle r="3" fill="#fff0bd"/></g>}
    {hat==='headphones'&&<path d="M15 45 V30 C15 3 66 3 66 30 V45 M15 36h8v15h-8 M59 36h8v15h-8" fill="none" stroke="#8173a9" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>}
   </g>
   {admin&&<Crown/>}
  </svg>}
 </span>;
}
