import {parseFragment,serialize,type DefaultTreeAdapterTypes} from 'parse5';

const htmlTags=new Set('a b blockquote br caption code col colgroup dd del div dl dt em h1 h2 h3 h4 h5 h6 hr i li mark ol p pre s small span strong sub sup table tbody td tfoot th thead tr u ul'.split(' '));
const mathTags=new Set('math semantics annotation mrow mi mo mn mtext mspace mfrac mroot msqrt msub msup msubsup munder mover munderover mtable mtr mtd mstyle mpadded menclose'.split(' '));
const svgTags=new Set(['svg','path','line']);
const discardedTags=new Set(['script','style','template','iframe','object','embed','noscript','textarea','input','select','button']);
const measure=/^[+-]?(?:\d{1,5}(?:\.\d{1,8})?|\.\d{1,8})(?:em|ex|rem|px|pt|%)?$/;
const layoutProperties=new Set('height width min-width max-width top left right bottom margin-left margin-right padding-left padding-right vertical-align border-top-width border-bottom-width border-right-width border-left-width'.split(' '));
const color=/^(?:#[0-9a-f]{3,8}|[a-z]{1,30})$/i;
// KaTeX class names used by its bundled stylesheet. User input cannot select app UI classes.
const mathClasses=new Set('accent-body accent-full amsrm angl anglpad arraycolsep base boldsymbol boxpad brace-center brace-left brace-right cancel-lap cancel-pad cd-arrow-pad cd-label-left cd-label-right cd-vert-arrow clap col-align-c col-align-l col-align-r delimcenter delimsizing eqn-num fbox fleqn fontsize-ensurer frac-line halfarrow-left halfarrow-right hide-tail katex katex-display katex-error katex-html katex-mathml large-op leqno llap mainrm mathbb mathbf mathboldfrak mathboldsf mathcal mathfrak mathit mathitsf mathnormal mathrm mathscr mathsf mathsfit mathtt mbin mclose minner mord mopen mop mpunct mrel mfrac mml-eqn-num mover mspace msupsub mtable mtr-glue mult munder nulldelimiter op-limits op-symbol overline-line pstrut reflectbox rlap sizing small-op sqrt stretchy strut svg-align tag text textbb textbf textboldfrak textboldsf textfrak textit textitsf textrm textscr textsf texttt underline-line vertical-separator vlist vlist-r vlist-s vlist-t vlist-t2 x-arrow x-arrow-pad'.split(' '));
const numberedMathClass=/^(?:size|reset-size|delim-size)(?:[1-9]|10|11)$/;

function mathStyle(style:string){
 const values:string[]=[];
 for(const item of style.split(';')){
  const [rawName,rawValue,...extra]=item.split(':');
  if(rawValue===undefined||extra.length)continue;
  const name=rawName.trim().toLowerCase(),value=rawValue.trim();
  if(layoutProperties.has(name)&&measure.test(value)||
   name==='position'&&value==='relative'||
   (name==='color'||name==='background-color'||name==='border-color')&&color.test(value)){
   values.push(name+':'+value);
  }
 }
 return values.join(';');
}

type Element=DefaultTreeAdapterTypes.Element;
type Node=DefaultTreeAdapterTypes.ChildNode;
const htmlNamespace='http://www.w3.org/1999/xhtml';
const mathNamespace='http://www.w3.org/1998/Math/MathML';
const svgNamespace='http://www.w3.org/2000/svg';

function cleanAttributes(element:Element,inFormula:boolean){
 element.attrs=element.attrs.filter(attr=>{
  if(attr.namespace||attr.prefix)return false;
  const {name,value}=attr;
  if(element.namespaceURI===htmlNamespace){
   if(name==='class'&&inFormula){
    attr.value=value.split(/\s+/).filter(name=>mathClasses.has(name)||numberedMathClass.test(name)).join(' ');
    return !!attr.value;
   }
   if(name==='style'&&inFormula){
    attr.value=mathStyle(value);
    return !!attr.value;
   }
   if(name==='aria-hidden'&&inFormula)return value==='true'||value==='false';
   if(element.tagName==='a'&&name==='href'){
    try{
     const url=new URL(value);
     return url.protocol==='https:'&&!url.username&&!url.password&&value.length<=2048;
    }catch{return false;}
   }
   if(name==='title')return value.length<=200;
   if(name==='border'&&element.tagName==='table')return /^(?:0|1)$/.test(value);
   return (element.tagName==='td'||element.tagName==='th')&&
    (name==='colspan'||name==='rowspan')&&/^[1-9]\d?$/.test(value);
  }
  if(element.namespaceURI===mathNamespace){
   if(name==='encoding'&&element.tagName==='annotation')return value==='application/x-tex';
   if(name==='mathvariant')return /^[a-z-]{1,32}$/.test(value);
   if(name==='display')return value==='block'||value==='inline';
   if(name==='stretchy'||name==='fence'||name==='separator'||name==='accent')return value==='true'||value==='false';
   return ['width','height','depth','lspace','rspace','voffset'].includes(name)&&measure.test(value);
  }
  if(name==='viewBox')return /^-?[\d.]+(?: +-?[\d.]+){3}$/.test(value)&&value.length<=100;
  if(name==='preserveAspectRatio')return /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/.test(value);
  if(name==='d'&&element.tagName==='path')return /^[\d\s.+,eEMmLlHhVvCcSsQqTtAaZz-]{1,20000}$/.test(value);
  if(name==='stroke'||name==='fill')return color.test(value);
  return ['width','height','x1','y1','x2','y2','stroke-width'].includes(name)&&measure.test(value);
 });
 if(element.namespaceURI===htmlNamespace&&element.tagName==='a'&&element.attrs.some(a=>a.name==='href')){
  element.attrs.push({name:'rel',value:'noreferrer noopener'});
 }
}

function cleanChildren(nodes:Node[],inFormula=false,depth=0):Node[]{
 if(depth===64)return [];
 const result:Node[]=[];
 for(const node of nodes){
  if(node.nodeName==='#text'){result.push(node);continue;}
  if(!('tagName'in node)||discardedTags.has(node.tagName))continue;
  const isFormula=inFormula||node.namespaceURI===htmlNamespace&&node.tagName==='span'&&
   node.attrs.some(attr=>attr.name==='class'&&attr.value.split(/\s+/).includes('katex'));
  const allowed=node.namespaceURI===htmlNamespace?htmlTags.has(node.tagName):
   node.namespaceURI===mathNamespace?mathTags.has(node.tagName):
   node.namespaceURI===svgNamespace&&isFormula&&svgTags.has(node.tagName);
  if(!allowed&&node.namespaceURI!==htmlNamespace)continue;
  node.childNodes=cleanChildren(node.childNodes,isFormula,depth+1);
  if(allowed){cleanAttributes(node,isFormula);result.push(node);}
  else result.push(...node.childNodes);
 }
 return result;
}

/** Use the same fragment policy at save/import and before browser rendering. */
export function sanitizeRichText(html:string):string{
 const fragment=parseFragment(html);
 fragment.childNodes=cleanChildren(fragment.childNodes);
 return serialize(fragment);
}

export function sanitizeQuestionRichText<T extends {prompt:string;explanation:string}>(question:T):T{
 return {...question,prompt:sanitizeRichText(question.prompt),explanation:sanitizeRichText(question.explanation)};
}
