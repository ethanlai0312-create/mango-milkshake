import {useRef} from 'react';

export const proofSymbols=[
 {glyph:'∵',label:'因为'},
 {glyph:'∴',label:'所以'},
 {glyph:'∠',label:'角'},
 {glyph:'△',label:'三角形'},
 {glyph:'≅',label:'全等'},
 {glyph:'⊥',label:'垂直'},
 {glyph:'∥',label:'平行'},
 {glyph:'>',label:'大于'},
 {glyph:'<',label:'小于'},
 {glyph:'≥',label:'大于等于'},
 {glyph:'≤',label:'小于等于'},
 {glyph:'=',label:'等于'},
 {glyph:'≠',label:'不等于'},
 {glyph:'°',label:'度'},
] as const;

export function ProofInput({value,onChange,readOnly=false,label='证明过程',rows=8}:{value:string|undefined;onChange:(value:string)=>void;readOnly?:boolean;label?:string;rows?:number}){
 const ref=useRef<HTMLTextAreaElement>(null);
 const insert=(glyph:string)=>{
  if(readOnly)return;
  const text=String(value??''),el=ref.current,start=el?.selectionStart??text.length,end=el?.selectionEnd??start;
  const next=text.slice(0,start)+glyph+text.slice(end);
  onChange(next);
  requestAnimationFrame(()=>{const node=ref.current;if(!node)return;node.focus();const pos=start+glyph.length;node.setSelectionRange(pos,pos);});
 };
 return <div className="proof-input">
  {!readOnly&&<div className="proof-symbols" role="toolbar" aria-label="数学符号">
   {proofSymbols.map(item=><button key={item.glyph} type="button" className="proof-symbol" aria-label={'插入'+item.label} title={item.label} onMouseDown={event=>event.preventDefault()} onClick={()=>insert(item.glyph)}>{item.glyph}</button>)}
  </div>}
  <textarea ref={ref} className="proof-text" aria-label={label} rows={rows} value={value??''} readOnly={readOnly} onChange={event=>onChange(event.target.value)} placeholder={readOnly?'':(label+'：可点上方符号插入，也可直接输入')}/>
 </div>;
}
