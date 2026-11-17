import {Button} from '../ui/Button';
import {OptionContent} from './OptionContent';
import {QuestionImage} from './QuestionImage';
import {Pairing} from './Pairing';
import {displayOrder} from '../../shared/ordering';
import type {Question} from '../../shared/model';
import {SafeHTML,renderFormula} from './RichText';
import {Drawing} from './Drawing';
import {Sortable} from './Sortable';
import {Upload} from './Upload';
import {api} from '../lib/api';
import {useEffect,useState} from 'react';
function HotspotAnswer({source,value,onChange,readOnly}:{source?:string;value?:{x:number;y:number};onChange:(value:{x:number;y:number})=>void;readOnly:boolean}){
 if(!source)return <span>出题者需设置图片网址</span>;
 return <QuestionImage source={source} alt="点击图片作答" render={(image,ready)=><div className="hotspot"
  role={ready?(readOnly?'img':'button'):undefined} tabIndex={ready&&!readOnly?0:undefined} aria-label={ready?'图片热点；使用方向键调整位置':undefined}
  onKeyDown={e=>{
   if(!ready||readOnly||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))return;
   e.preventDefault();
   const x=(value?.x??50)+(e.key==='ArrowLeft'?-5:e.key==='ArrowRight'?5:0);
   const y=(value?.y??50)+(e.key==='ArrowUp'?-5:e.key==='ArrowDown'?5:0);
   onChange({x:Math.max(0,Math.min(100,x)),y:Math.max(0,Math.min(100,y))});
  }}
  onClick={e=>{
   if(!ready||readOnly)return;
   const r=e.currentTarget.getBoundingClientRect();
   onChange({x:(e.clientX-r.left)/r.width*100,y:(e.clientY-r.top)/r.height*100});
  }}>
  {image}{ready&&value&&<span className="hotspot-dot" style={{left:value.x+'%',top:value.y+'%'}}>⊕</span>}
 </div>}/>;
}
export function Attachment({id}:{id:string}){const [url,setUrl]=useState(''),[mime,setMime]=useState('');useEffect(()=>{api('fileUrl',{id}).then(d=>{setUrl(d.signedUrl);setMime(d.mime??'');}).catch(()=>{});},[id]);return url?<div className="attachment">{mime.startsWith('image/')&&<img src={url} alt="题目附件" style={{maxWidth:'100%',maxHeight:400}}/>}{mime.startsWith('video/')&&<video src={url} controls preload="metadata" style={{maxWidth:'100%'}}/>}<a target="_blank" href={url} rel="noreferrer">查看 / 下载附件</a>{mime.startsWith('video/')&&<small>无法播放时请下载查看。</small>}</div>:<small>附件需要联网加载</small>;}
export function PreviewAnswer({q}:{q:Question}){const [value,setValue]=useState<any>();return <QuestionAnswer q={q} value={value} onChange={setValue}/>;}
export function QuestionAnswer({q,value,onChange,attempt_id,readOnly=false}:{q:Question;value:any;onChange:(v:any)=>void;attempt_id?:string;readOnly?:boolean}){const inputName=q.id+':'+(attempt_id??'preview');const input=(i:number,v:any)=>{const a=[...(Array.isArray(value)?value:[])];a[i]=v;onChange(a);};const order=q.shuffle?displayOrder(q.options.length,(attempt_id??'preview')+q.id):q.options.map((_,i)=>i);return <fieldset disabled={readOnly&&q.kind!=='drawing'&&q.kind!=='hotspot'}><div className="question-answer"><SafeHTML html={q.prompt}/>{q.attachments.filter(id=>!q.options.some(option=>option.includes('['+id+']'))).map(id=><Attachment id={id} key={id}/>)}{q.kind==='single'&&order.map(i=><label className="option" key={i}><input type="radio" name={inputName} checked={String(value)===String(i)} onChange={()=>onChange(i)}/><span>{String.fromCharCode(65+i)}.</span> <OptionContent text={q.options[i]}/></label>)}{q.kind==='multiple'&&order.map(i=><label className="option" key={i}><input type="checkbox" checked={(value??[]).includes(i)} onChange={e=>onChange(e.target.checked?[...(value??[]),i]:(value??[]).filter((v:number)=>v!==i))}/><OptionContent text={q.options[i]}/></label>)}{q.kind==='boolean'&&['true','false'].map((v,i)=><label className="option" key={v}><input type="radio" name={inputName} checked={value===v} onChange={()=>onChange(v)}/>{i?'错误':'正确'}</label>)}{['blank','numeric','formula'].includes(q.kind)&&<input aria-label="填写答案" value={value??''} onChange={e=>onChange(e.target.value)} placeholder={q.kind==='formula'?'输入 LaTeX 表达式（人工批改）':'填写答案'}/>} {q.kind==='blanks'&&Array.from({length:q.options.length||2},(_,i)=><label key={i}>{q.options[i]||`第 ${i+1} 空`}<input value={value?.[i]??''} onChange={e=>input(i,e.target.value)}/></label>)}{q.kind==='table'&&<table><thead><tr><th>项目</th><th>填写答案</th></tr></thead><tbody>{q.options.map((label,i)=><tr key={i}><th>{label}</th><td><input aria-label={'表格第'+(i+1)+'空'} value={value?.[i]??''} onChange={e=>input(i,e.target.value)}/></td></tr>)}</tbody></table>}{q.kind==='short'&&<textarea aria-label="简答答案" rows={6} value={value??''} onChange={e=>onChange(e.target.value)}/>} {['matching','connection'].includes(q.kind)&&<Pairing options={q.options} order={order} value={value} onChange={onChange} readOnly={readOnly}/>}{q.kind==='ordering'&&<Sortable ids={(Array.isArray(value)&&value.length===q.options.length?value:displayOrder(q.options.length,(attempt_id??'preview')+q.id)).map(String)} onChange={ids=>{if(!readOnly)onChange(ids.map(Number));}}>{id=><span>{q.options[+id]}</span>}</Sortable>}{q.kind==='ordering'&&!readOnly&&<Button onClick={()=>onChange(Array.isArray(value)?value:displayOrder(q.options.length,(attempt_id??'preview')+q.id))}>确认当前顺序</Button>}{q.kind==='formula'&&value&&<SafeHTML html={renderFormula(String(value))}/>}{q.kind==='hotspot'&&<HotspotAnswer source={q.options[0]} value={value} onChange={onChange} readOnly={readOnly}/>}{q.kind==='drawing'&&<Drawing value={value} onChange={onChange} mode={q.drawing?.mode??'free'} initial={q.drawing?.initial} readOnly={readOnly}/>} {q.kind==='file'&&<>{!readOnly&&<Upload purpose="submission" attempt_id={attempt_id} onDone={f=>onChange(f.id)}/>}{value&&<Attachment id={value}/>}<small>需联网上传 · 人工批改</small></>}</div></fieldset>;}
