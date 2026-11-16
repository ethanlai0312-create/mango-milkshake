import {useEffect,useState} from 'react';
import {api} from '../lib/api';
export function OptionContent({text}:{text:string}){
 const match=/^(图片|视频)\[([0-9a-f-]{36})\]$/.exec(text),id=match?.[2];const [file,setFile]=useState<any>(null);
 useEffect(()=>{let active=true;setFile(null);if(id)api('fileUrl',{id}).then(f=>{if(active)setFile(f);}).catch(()=>{});return()=>{active=false;};},[id]);
 if(!id)return <span>{text}</span>;if(!file)return <small>媒体需联网加载</small>;
 return file.mime.startsWith('image/')?<img src={file.signedUrl} alt="选项图片" style={{maxWidth:'100%',maxHeight:240}}/>:file.mime.startsWith('video/')?<video src={file.signedUrl} controls preload="metadata" style={{maxWidth:'100%',maxHeight:240}}/>:<a href={file.signedUrl} target="_blank" rel="noreferrer">下载选项附件</a>;
}
