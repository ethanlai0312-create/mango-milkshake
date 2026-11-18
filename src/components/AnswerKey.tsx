import {useId,useState} from 'react';
import {Button} from '../ui/Button';
import {QuestionImage} from './QuestionImage';
import type {Question} from '../../shared/model';
import {Sortable} from './Sortable';
import {Drawing} from './Drawing';
import {ProofInput} from './ProofInput';
export function AnswerKey({q,onChange}:{q:Question;onChange:(p:Partial<Question>)=>void}){
 const [referenceOpen,setReferenceOpen]=useState(false),referenceId=useId();
 if(q.kind==='drawing')return <div className="geometry-reference-editor">
  <Button className="primary geometry-editor-toggle" aria-expanded={referenceOpen} aria-controls={referenceId} onClick={()=>setReferenceOpen(value=>!value)}>{referenceOpen?'收起参考答案':q.answer?'编辑与回放参考答案':'录制参考答案'}</Button>
  <p className="muted geometry-editor-hint">参考答案默认保密，管理员可在批改后公开。</p>
  <div id={referenceId} hidden={!referenceOpen}><Drawing key={q.id+':reference:'+JSON.stringify({mode:q.drawing?.mode,objects:q.drawing?.initial?.objects})} value={q.answer||undefined} mode={q.drawing?.mode??'free'} initial={q.drawing?.initial} onChange={answer=>onChange({answer})}/></div>
 </div>;
 if(q.kind==='proof')return <div><ProofInput label="参考证明或评分要点（可选）" value={typeof q.answer==='string'?q.answer:''} onChange={answer=>onChange({answer})}/><small>答题者提交后，批改页和答案页会显示这段参考证明。</small></div>;
 if(q.kind==='single')return <select aria-label="正确答案" value={q.answer} onChange={e=>onChange({answer:e.target.value===''?'':+e.target.value})}><option value="">选择正确选项</option>{q.options.map((o,i)=><option key={i} value={i}>{String.fromCharCode(65+i)}. {o}</option>)}</select>;
 if(q.kind==='multiple')return <>{q.options.map((o,i)=><label className="check" key={i}><input type="checkbox" checked={(Array.isArray(q.answer)?q.answer:[]).includes(i)} onChange={e=>onChange({answer:e.target.checked?[...q.answer,i]:q.answer.filter((n:number)=>n!==i)})}/>{o}</label>)}</>;
 if(q.kind==='boolean')return <select value={q.answer} onChange={e=>onChange({answer:e.target.value})}><option value="true">正确</option><option value="false">错误</option></select>;
 if(q.kind==='blank')return <textarea aria-label="可接受答案" value={(Array.isArray(q.answer)?q.answer:[]).join('\n')} onChange={e=>onChange({answer:e.target.value.split('\n')})} placeholder="每行一个可接受答案"/>;
 if(['blanks','table'].includes(q.kind))return <>{q.options.map((_,i)=><label key={i}>第{i+1}空（可接受答案用 | 分隔）<input value={q.answer?.[i]?.join('|')??''} onChange={e=>{const a=[...(q.answer??[])];a[i]=e.target.value.split('|');onChange({answer:a});}}/><input aria-label={'第'+(i+1)+'空分值'} type="number" min="0" placeholder="本空分值（留空为平均分）" value={q.blankPoints[i]??''} onChange={e=>{const a=[...q.blankPoints];a[i]=+e.target.value;onChange({blankPoints:a});}}/></label>)}</>;
 if(q.kind==='numeric')return <><input aria-label="正确数值" value={q.answer} placeholder="正确数值或分数" onChange={e=>onChange({answer:e.target.value})}/><label>允许误差<input type="number" step=".001" min="0" value={q.tolerance} onChange={e=>onChange({tolerance:+e.target.value})}/></label></>;
 if(q.kind==='ordering'){const order=Array.isArray(q.answer)&&q.answer.length===q.options.length?q.answer:q.options.map((_,i)=>i);return <><small>拖动排序；键盘用 Alt＋↑／↓。</small><Sortable ids={order.map(String)} onChange={ids=>onChange({answer:ids.map(Number)})}>{id=><span>{q.options[+id]||'未命名项目'}</span>}</Sortable></>;}
 if(['matching','connection'].includes(q.kind))return <>{q.options.map((o,i)=><label key={i}>{o.split('↔')[0]||`左项${i+1}`}<select value={q.answer?.[i]??''} onChange={e=>{const a=[...(q.answer??[])];a[i]=+e.target.value;onChange({answer:a});}}><option value="">选择正确配对</option>{q.options.map((r,j)=><option key={j} value={j}>{r.split('↔')[1]??r}</option>)}</select></label>)}</>;
 if(q.kind==='hotspot')return <>
  <small>点击正确位置，设置允许半径。</small>
  {q.options[0]&&<QuestionImage source={q.options[0]} alt="设置正确热点中心" render={(image,ready)=><div className="hotspot" onClick={e=>{
   if(!ready)return;
   const r=e.currentTarget.getBoundingClientRect();
   onChange({answer:{x:(e.clientX-r.left)/r.width*100,y:(e.clientY-r.top)/r.height*100,radius:q.answer?.radius??10}});
  }}>{image}{ready&&q.answer&&<span className="hotspot-dot" style={{left:q.answer.x+'%',top:q.answer.y+'%'}}>⊕</span>}</div>}/>}
  <label>允许半径（图片百分比）<input type="number" min=".1" max="100" step=".1" value={q.answer?.radius??10} onChange={e=>onChange({answer:{x:50,y:50,...q.answer,radius:+e.target.value}})}/></label>
 </>;
 return <p className="notice">人工批改</p>;
}

export function DrawingReference({q}:{q:Question}){
 if(q.kind!=='drawing'||q.answer===undefined||q.answer===null||q.answer==='')return null;
 return <section className="geometry-reference-answer" aria-label="参考答案（非唯一正解）"><h3>参考答案（非唯一正解）</h3><p>以下仅展示一种符合要求的作图方法。只要满足题目条件和作图规则，其他正确的作图方法同样有效。</p><Drawing value={q.answer} mode={q.drawing?.mode??'free'} initial={q.drawing?.initial} onChange={()=>{}} readOnly/></section>;
}
