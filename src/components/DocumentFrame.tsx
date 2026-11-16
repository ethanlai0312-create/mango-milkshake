import {Button} from '../ui/Button';

/** Real document controls remain in place while their authorized contents arrive. */
export function DocumentFrame({kind,onClose,error,onRetry}:{kind:'editor'|'attempt';onClose:()=>void;error?:string;onRetry?:()=>void}){
 const editor=kind==='editor';
 return <div className={editor?'editor-page':'attempt-page'} data-page-pending={!error} aria-busy={!error}>
  <div className="page-heading"><div><Button onClick={onClose}>{editor?'← 我的试卷':'← 返回'}</Button><h1>{editor?'试卷编辑器':'在线答卷'}</h1></div>
   {editor&&<div className="actions"><Button disabled>撤销</Button><Button disabled>重做</Button><Button disabled>作答预览</Button><Button disabled>保存</Button><Button className="primary" disabled>提交审核</Button></div>}
  </div>
  {error&&<div className="notice error" role="alert">{error}{onRetry&&<Button onClick={onRetry}>重试</Button>}</div>}
  <div className="document-frame-grid"><aside className="card"><h3>题目导航</h3><Button disabled>{editor?'添加题目':'手动保存'}</Button></aside><section className="card document-frame-body" aria-label={editor?'题目编辑':'题目内容'}>
   {editor&&<fieldset disabled><label>题干<textarea rows={6}/></label><div className="form-grid"><label>题型<select><option>选择题型</option></select></label><label>分值<input type="number"/></label></div></fieldset>}
  </section></div>
 </div>;
}
