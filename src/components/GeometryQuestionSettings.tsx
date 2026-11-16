import type {Question} from '../../shared/model';
import type {DrawingMode} from '../../shared/geometry/types';
import {Drawing} from './Drawing';
import {equalData} from '../../shared/geometry/timeline';
import {useId,useState} from 'react';
import {Button} from '../ui/Button';

export function GeometryQuestionSettings({q,onChange}:{q:Question;onChange:(patch:Partial<Question>)=>void}){
 const mode=q.drawing?.mode??'free';
 const [open,setOpen]=useState(false),panelId=useId();
 return <section className="geometry-question-settings" aria-label="几何题配置">
  <h3>作图设置</h3>
  <label>答题模式<select aria-label="几何题答题模式" value={mode} onChange={event=>onChange({drawing:{...q.drawing,mode:event.target.value as DrawingMode},answer:''})}><option value="free">自由绘图</option><option value="strict">严格尺规作图</option></select></label>
  <p className="muted">{mode==='strict'?'仅限无刻度直尺与圆规。':'可使用全部绘图工具。'}</p>
  <Button className="primary geometry-editor-toggle" aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(value=>!value)}>{open?'收起初始图形':'编辑初始图形'}</Button>
  <p className="muted geometry-editor-hint">初始图形在答题时锁定。更改模式或图形后须重录答案。</p>
  <div id={panelId} hidden={!open}><Drawing key={q.id+':initial'} value={q.drawing?.initial} mode="free" authoring onChange={initial=>onChange({drawing:{mode,initial},...equalData(initial.objects,q.drawing?.initial?.objects??[])?{}:{answer:''}})}/></div>
 </section>;
}
