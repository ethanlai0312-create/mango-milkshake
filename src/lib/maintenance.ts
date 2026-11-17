import {api} from './api';
export type MaintenanceState={active:boolean;until:string|null;message:string};
const KEY='mango-maintenance';
const DEFAULT_MESSAGE='服务器正在维护或添加功能，请稍等预计5~10分钟恢复';
export function readStoredMaintenance():MaintenanceState|null{
 try{const raw=localStorage.getItem(KEY);if(!raw)return null;const value=JSON.parse(raw);if(!value||typeof value.active!=='boolean'||!value.active)return null;return {active:true,until:typeof value.until==='string'?value.until:null,message:typeof value.message==='string'&&value.message?value.message:DEFAULT_MESSAGE};}catch{return null;}
}
function store(value:MaintenanceState|null){try{if(value?.active)localStorage.setItem(KEY,JSON.stringify(value));else localStorage.removeItem(KEY);}catch{}}
export async function fetchMaintenance():Promise<MaintenanceState>{
 const data=await api('maintenance');
 if(!data||typeof data.active!=='boolean')throw new Error('维护状态无效');
 const value={active:data.active,until:typeof data.until==='string'?data.until:null,message:typeof data.message==='string'&&data.message?data.message:DEFAULT_MESSAGE};
 store(value);
 return value;
}
export function watchMaintenance(publish:(state:MaintenanceState|null)=>void){
 let stopped=false;
 const tick=async()=>{
  try{const state=await fetchMaintenance();if(stopped)return;publish(state.active?state:null);if(state.active)window.dispatchEvent(new CustomEvent('mango-maintenance',{detail:state}));}
  catch{const stored=readStoredMaintenance();if(!stopped&&stored)publish(stored);}
 };
 void tick();
 const timer=setInterval(()=>void tick(),15000);
 return()=>{stopped=true;clearInterval(timer);};
}
