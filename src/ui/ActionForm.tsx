import {createContext,useEffect,useRef,useState,type FormHTMLAttributes} from 'react';
import {notify} from './Feedback';
export const FormPending=createContext(false);
export function ActionForm({onSubmit,children,...props}:FormHTMLAttributes<HTMLFormElement>){
 const [pending,setPending]=useState(false),lock=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 return <FormPending.Provider value={pending}><form {...props} aria-busy={pending||undefined} onSubmit={event=>{
  if(lock.current){event.preventDefault();return;}
  try{const result=onSubmit?.(event) as unknown;if(result&&typeof(result as Promise<unknown>).then==='function'){
   lock.current=true;setPending(true);void Promise.resolve(result).catch(error=>notify(error instanceof Error?error.message:'提交失败，请重试','error')).finally(()=>{lock.current=false;if(mounted.current)setPending(false);});
  }}catch(error){event.preventDefault();notify(error instanceof Error?error.message:'提交失败，请重试','error');}
 }}>{children}</form></FormPending.Provider>;
}
