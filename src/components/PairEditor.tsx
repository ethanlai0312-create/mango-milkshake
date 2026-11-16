import type {Question} from '../../shared/model';
import {Upload} from './Upload';
import {PairItem} from './Pairing';
export function PairEditor({q,examId,onChange,onImage}:{q:Question;examId:string;onChange:(options:string[])=>void;onImage:(index:number,side:number,file:any)=>void}){
 return <div>{q.options.map((option,i)=>{const parts=option.split('↔');return <div className="card" key={i}><strong>第 {i+1} 对</strong>{[0,1].map(side=><details key={side}><summary>{side?'右侧':'左侧'} · 编辑文字或上传图片</summary><input aria-label={`${side?'右':'左'}项${i+1}`} value={parts[side]??''} onChange={e=>{const next=[...parts];next[side]=e.target.value;onChange(q.options.map((v,j)=>i===j?next.join('↔'):v));}}/><PairItem text={parts[side]??''}/><Upload purpose="attachment" exam_id={examId} onDone={file=>onImage(i,side,file)}/></details>)}</div>;})}</div>;
}
