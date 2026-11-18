export type MotionPreference='system'|'full'|'reduced';
export const MOTION_PREFERENCE_KEY='mango-interface-motion-v1';
export const MOTION_CHANGE_EVENT='mango-motion-change';
const DEFAULT_MOTION:MotionPreference='full';
let volatilePreference:MotionPreference|undefined;
const valid=(value:unknown):value is MotionPreference=>value==='system'||value==='full'||value==='reduced';

/** A non-sensitive browser preference, never part of authentication or server settings. */
export function getMotionPreference():MotionPreference{
 if(volatilePreference)return volatilePreference;
 try{const value=window.localStorage.getItem(MOTION_PREFERENCE_KEY);return valid(value)?value:DEFAULT_MOTION;}
 catch{return DEFAULT_MOTION;}
}
function applyPreference(){if(typeof document!=='undefined')document.documentElement.dataset.motionPreference=getMotionPreference();}
function announce(){if(typeof window!=='undefined')window.dispatchEvent(new Event(MOTION_CHANGE_EVENT));}

export function setMotionPreference(preference:MotionPreference){
 if(!valid(preference))return;
 volatilePreference=preference;
 try{window.localStorage.setItem(MOTION_PREFERENCE_KEY,preference);volatilePreference=undefined;}
 catch{/* The selected mode still works for this tab when browser storage is unavailable. */}
 applyPreference();announce();
}
export function shouldReduceMotion(){
 const preference=getMotionPreference();
 if(preference!=='system')return preference==='reduced';
 try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
 catch{return false;}
}
/** Initialize CSS state and synchronize browser tabs. Return the effect cleanup. */
export function initMotionPreference(){
 applyPreference();
 if(typeof window==='undefined')return ()=>{};
 const synchronize=(event:StorageEvent)=>{
  if(event.key!==null&&event.key!==MOTION_PREFERENCE_KEY)return;
  applyPreference();announce();
 };
 window.addEventListener('storage',synchronize);
 return()=>window.removeEventListener('storage',synchronize);
}
// Set the default before the first Vue/React paint and before route animations run.
if(typeof document!=='undefined')applyPreference();
