import {useEffect} from 'react';

/** Include lazy content and portals, while preserving authored answers and account names. */
export function useInterfaceLanguage(language:string|undefined){
 useEffect(()=>{
  if(!language){document.documentElement.lang='zh-Hans';return;}
  let disposed=false,queued=false,observer:MutationObserver|undefined;
  void import('opencc-js').then(OpenCC=>{
   if(disposed)return;
   const traditional=language==='zh-TW',convert=OpenCC.Converter({from:traditional?'cn':'tw',to:traditional?'tw':'cn'});
   document.documentElement.lang=traditional?'zh-Hant':'zh-Hans';
   const excluded='input,textarea,[contenteditable],.rich-content,.question-answer,.route-outgoing,[data-user-content],code,pre';
   const apply=()=>{
    observer?.disconnect();
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node:Node|null;
    while(node=walker.nextNode()){
     if(node.parentElement?.closest(excluded))continue;
     const text=node.textContent??'',next=convert(text);
     if(next!==text)node.textContent=next;
    }
    observer?.observe(document.body,{childList:true,subtree:true,characterData:true});
   };
   observer=new MutationObserver(()=>{
    if(queued)return;queued=true;
    queueMicrotask(()=>{queued=false;if(!disposed)apply();});
   });
   apply();
  });
  return()=>{disposed=true;observer?.disconnect();};
 },[language]);
}
