import {useLayoutEffect,useRef} from 'react';
import DOMPurify from 'dompurify';
import katex from 'katex';
import {sanitizeRichText} from '../../shared/rich-text';
import {promptText,showMessage} from '../lib/dialogs';
import {Button} from '../ui/Button';

const formatting=[
 ['B','bold','加粗'],['I','italic','斜体'],['U','underline','下划线'],
 ['x²','superscript','上标'],['x₂','subscript','下标'],['• 列表','insertUnorderedList','项目列表'],
] as const;
const table='<table border="1"><tbody><tr><td>单元格</td><td>单元格</td></tr><tr><td>单元格</td><td>单元格</td></tr></tbody></table><p><br></p>';
const formulaOptions={trust:false,maxSize:20,maxExpand:200,output:'html'} as const;

export function renderFormula(tex:string,throwOnError=false):string{
 if(tex.length>2000){
  if(throwOnError)throw new Error('公式过长');
  return '';
 }
 return katex.renderToString(tex,{...formulaOptions,throwOnError});
}

const browserHTML=(html:string)=>DOMPurify.sanitize(sanitizeRichText(html));
const browserFragment=(html:string)=>DOMPurify.sanitize(sanitizeRichText(html),{RETURN_DOM_FRAGMENT:true});
export function SafeHTML({html}:{html:string}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{ref.current?.replaceChildren(browserFragment(html));},[html]);
 return <div className="rich-content" ref={ref}/>;
}

export function RichText({value,onChange,label='题干'}:{value:string;onChange:(s:string)=>void;label?:string}){
 const ref=useRef<HTMLDivElement>(null);
 const change=()=>{if(ref.current)onChange(browserHTML(ref.current.innerHTML));};
 type FormattingCommand=typeof formatting[number][1]|'insertHTML'|'insertText';
 const apply=(cmd:FormattingCommand,arg?:string)=>{
  const editor=ref.current;
  if(!editor)return;
  editor.focus();
  const selection=window.getSelection();
  if(selection&&(!selection.rangeCount||!editor.contains(selection.getRangeAt(0).commonAncestorContainer))){
   const range=document.createRange();
   range.selectNodeContents(editor);
   range.collapse(false);
   selection.removeAllRanges();
   selection.addRange(range);
  }
  // Keep the browser's undo history. Only fixed toolbar commands reach this API,
  // and HTML insertions pass through the same sanitizers as saved content.
  document.execCommand(cmd,false,cmd==='insertHTML'?browserHTML(arg??''):arg);
  change();
 };
 const applyFormula=async()=>{
  const selection=window.getSelection();
  const range=selection?.rangeCount?selection.getRangeAt(0).cloneRange():null;
  const tex=await promptText('输入 LaTeX 公式，如 x^2+\\frac{1}{2}');
  if(!tex)return;
  try{
   ref.current?.focus();
   if(range&&ref.current?.contains(range.commonAncestorContainer)){
    selection?.removeAllRanges();
    selection?.addRange(range);
   }
   apply('insertHTML',renderFormula(tex,true));
  }catch{await showMessage('公式格式错误或过长');}
 };
 const insertTransfer=(data:DataTransfer)=>{
  const html=data.getData('text/html'),text=data.getData('text/plain').slice(0,100000);
  const clean=html.length<=100000&&html?browserHTML(html):'';
  if(clean)apply('insertHTML',clean);
  else if(text)apply('insertText',text);
 };
 return <div className="rich-editor">
  <div className="toolbar">
   {formatting.map(([name,cmd,title])=><Button preserveFocus type="button" key={cmd} title={title} aria-label={title} onMouseDown={e=>e.preventDefault()} onClick={async()=>apply(cmd)}>{name}</Button>)}
   <Button preserveFocus onMouseDown={e=>e.preventDefault()} onClick={applyFormula}>公式</Button>
   <Button preserveFocus onMouseDown={e=>e.preventDefault()} onClick={async()=>apply('insertHTML',table)}>表格</Button>
   <Button preserveFocus onMouseDown={e=>e.preventDefault()} onClick={async()=>apply('insertText','∠ ° π √ ± ≠ ≤ ≥')}>符号</Button>
  </div>
  <div key={label} ref={element=>{
   ref.current=element;
   if(element&&document.activeElement!==element){
    const html=browserHTML(value);
    if(element.innerHTML!==html)element.replaceChildren(browserFragment(html));
   }
  }} className="editable" contentEditable suppressContentEditableWarning aria-label={label} role="textbox"
   onInput={change}
   onPaste={event=>{event.preventDefault();insertTransfer(event.clipboardData);}}
   onDrop={event=>{event.preventDefault();insertTransfer(event.dataTransfer);}}
   onDragOver={event=>event.preventDefault()}/>
 </div>;
}
