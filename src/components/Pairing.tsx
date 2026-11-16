import {Button} from '../ui/Button';
import {useEffect,useState} from 'react';
import {api} from '../lib/api';
export function PairItem({text}:{text:string}){
 const id=/^图片\[([0-9a-f-]{36})\]$/.exec(text)?.[1];const [url,setUrl]=useState('');
 useEffect(()=>{let active=true;setUrl('');if(id)api('fileUrl',{id}).then(d=>{if(active)setUrl(d.signedUrl);}).catch(()=>{});return()=>{active=false;};},[id]);
 return id?(url?<img src={url} alt="配对图片"/>:<span>图片需要联网加载</span>):<span>{text}</span>;
}
export function Pairing({options,order,value,onChange,readOnly}:{options:string[];order:number[];value:any;onChange:(v:any)=>void;readOnly:boolean}){
 const [left,setLeft]=useState<number|null>(null);const answers=Array.isArray(value)?value:[];
 return <><p>先选左项，再选右项。</p><div className="pair-board">
 <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="配对连线">{answers.map((right,i)=>Number.isInteger(right)&&order.includes(right)&&<line key={i} x1="40" y1={(i+.5)*100/options.length} x2="60" y2={(order.indexOf(right)+.5)*100/options.length} stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}</svg>
 <div>{options.map((o,i)=><Button type="button" className={left===i?'active':''} key={i} aria-label={'左项 '+(i+1)+'：'+(o.split('↔')[0].startsWith('图片[')?'图片':o.split('↔')[0])} disabled={readOnly} onClick={()=>setLeft(i)}><PairItem text={o.split('↔')[0]}/><small>{Number.isInteger(answers[i])?'已配对':'未配对'}</small></Button>)}</div>
 <div>{order.map(j=><Button type="button" key={j} aria-label={'右项 '+(j+1)+'：'+((options[j].split('↔')[1]??options[j]).startsWith('图片[')?'图片':options[j].split('↔')[1]??options[j])} disabled={readOnly||left===null} onClick={()=>{const next=[...answers];next[left!]=j;onChange(next);setLeft(null);}}><PairItem text={options[j].split('↔')[1]??options[j]}/></Button>)}</div>
 </div></>;
}
