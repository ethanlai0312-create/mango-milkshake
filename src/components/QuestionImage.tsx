import {useEffect,useState,type ReactElement,type ReactNode} from 'react';
import {api} from '../lib/api';
import {externalImageUrl} from '../lib/media-url';
import {Button} from '../ui/Button';

type ImageSurface=(image:ReactElement,ready:boolean)=>ReactNode;
function ExternalImage({url,alt,render}:{url:URL;alt:string;render:ImageSurface}){
 const [state,setState]=useState<'waiting'|'requested'|'loaded'|'failed'>('waiting');
 if(state==='requested'||state==='loaded'){
  const image=<img src={url.href} alt={alt} referrerPolicy="no-referrer" data-external-image onLoad={()=>setState('loaded')} onError={()=>setState('failed')}/>;
  return render(image,state==='loaded');
 }
 return <div className="external-question-image">
  {state==='failed'&&<p role="status">无法加载外部图片。</p>}
  <Button onClick={async()=>setState('requested')}>加载外部图片（{url.hostname}）</Button>
 </div>;
}

export function QuestionImage({source,alt,render}:{source:string;alt:string;render:ImageSurface}){
 const id=/^图片\[([0-9a-f-]{36})\]$/.exec(source)?.[1];
 const [image,setImage]=useState<{id:string;url:string}>();
 useEffect(()=>{
  let active=true;
  setImage(undefined);
  if(id)api('fileUrl',{id}).then(d=>{if(active&&d.mime.startsWith('image/'))setImage({id,url:d.signedUrl});}).catch(()=>{});
  return()=>{active=false;};
 },[id]);
 const external=id?undefined:externalImageUrl(source);
 if(external)return <ExternalImage key={external.href} url={external} alt={alt} render={render}/>;
 return image&&image.id===id?render(<img src={image.url} alt={alt}/>,true):<span>图片需要联网加载；无法预览的格式请先转为PNG或JPEG。</span>;
}
