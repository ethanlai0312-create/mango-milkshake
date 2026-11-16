import {Component,createRef,type ReactNode} from 'react';
import {pageMotion,RouteReadiness,type MotionPoint} from '../../shared/page-motion';
import {shouldReduceMotion} from '../lib/interface-motion';
import '../styles/continuity.css';

type Props={routeKey:string;children:ReactNode;origin?:MotionPoint;beforeReveal?:(ready:boolean)=>boolean};
let snapshotSequence=0;
/** A brief inert DOM snapshot bridges routes without mounting business components twice. */
export class PageSurface extends Component<Props,{},HTMLDivElement|null>{
 private content=createRef<HTMLDivElement>();
 private root=createRef<HTMLDivElement>();
 private entering:Animation|null=null;
 private exiting:Animation|null=null;
 private observer:MutationObserver|null=null;
 private readiness=new RouteReadiness();
 private revealFrame=0;
 private outgoing:HTMLDivElement|null=null;
 private restoreFocus=false;
 private stop(){cancelAnimationFrame(this.revealFrame);this.revealFrame=0;this.entering?.cancel();this.exiting?.cancel();this.entering=null;this.exiting=null;this.outgoing?.remove();this.outgoing=null;}
 private isPending(){return Array.from(this.content.current?.querySelectorAll('[data-page-pending="true"]')??[]).some(node=>node.closest('.route-stage')===this.root.current);}
 private watchContent(){
  this.observer?.disconnect();const content=this.content.current;if(!content)return;
  this.readiness.reset(this.isPending());
  this.observer=new MutationObserver(()=>{
   if(content!==this.content.current)return;
   // Data replaces only its own region. It must never launch a second page flight.
   if(this.readiness.update(this.isPending()))this.props.beforeReveal?.(true);
  });
  this.observer.observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['data-page-pending']});
 }
 private reveal(){
  const content=this.content.current;if(!content)return;
  const routeKey=this.props.routeKey;
  cancelAnimationFrame(this.revealFrame);
  // App restores scroll and closes a drawer before the target rectangle is measured.
  this.revealFrame=requestAnimationFrame(()=>{
   this.revealFrame=0;if(content!==this.content.current||routeKey!==this.props.routeKey)return;
   this.entering?.cancel();this.entering=null;
   this.props.beforeReveal?.(!this.isPending());
   const rect=content.getBoundingClientRect();
   const policy=pageMotion(shouldReduceMotion(),{origin:this.props.origin,rect,viewport:{width:innerWidth,height:innerHeight}});
   const opacity=policy.fromOpacity,transform=policy.fromTransform;
   content.style.transformOrigin=policy.transformOrigin;
   content.style.setProperty('--route-from-transform',transform);
   content.style.setProperty('--route-from-opacity',String(opacity));
   content.style.setProperty('--route-duration',policy.duration+'ms');
   content.dataset.routeMode=policy.mode;content.dataset.routePhase='revealing';
   if(typeof content.animate!=='function'){
    content.classList.remove('route-fallback');void content.offsetWidth;content.classList.add('route-fallback');
    return;
   }
   const entering=content.animate([{opacity,transform},{opacity:1,transform:policy.toTransform}],{duration:policy.duration,easing:policy.easing});
   this.entering=entering;
   void entering.finished.then(()=>{if(this.entering===entering){content.dataset.routePhase='settled';this.entering=null;entering.cancel();}},()=>{});
  });
 }
 componentDidMount(){this.watchContent();}
 getSnapshotBeforeUpdate(previous:Props){
  if(previous.routeKey===this.props.routeKey)return null;
  const content=this.content.current;
  this.restoreFocus=!!content?.contains(document.activeElement);
  const interrupted=!!this.entering||!!this.revealFrame||!!content?.classList.contains('route-fallback');
  this.stop();
  // Do not cancel a tiny flying page into a full-size outgoing flash on rapid navigation.
  if(interrupted||!content||typeof content.animate!=='function')return null;
  const rect=content.getBoundingClientRect();
  const top=Math.max(rect.top,Math.min(innerHeight,parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height'))||0));
  const bottom=Math.min(innerHeight,rect.bottom);
  if(bottom<=top)return null;
  const snapshot=document.createElement('div'),copy=content.cloneNode(true) as HTMLDivElement;
  snapshot.className='route-outgoing';snapshot.inert=true;snapshot.setAttribute('aria-hidden','true');
  Object.assign(snapshot.style,{left:rect.left+'px',top:top+'px',width:rect.width+'px',height:(bottom-top)+'px'});
  copy.className='route-snapshot-content';copy.style.transform=`translateY(${rect.top-top}px)`;
  const originalNodes=[content,...content.querySelectorAll<HTMLElement>('*')],copyNodes=[copy,...copy.querySelectorAll<HTMLElement>('*')];
  originalNodes.forEach((node,index)=>{
   const clone=copyNodes[index];
   if(node.scrollTop||node.scrollLeft)clone.dataset.snapshotScroll=JSON.stringify([node.scrollTop,node.scrollLeft]);
   if(node instanceof HTMLCanvasElement&&clone instanceof HTMLCanvasElement)try{clone.getContext('2d')?.drawImage(node,0,0);}catch{/* A lost context still permits navigation. */}
  });
  copy.querySelectorAll('iframe,video,audio,img[data-external-image],.route-outgoing').forEach(node=>node.remove());
  // Keep SVG patterns/clip paths, while isolating their IDs from the live page.
  const ids=new Map<string,string>(),prefix='route-snapshot-'+(++snapshotSequence)+'-';
  copy.querySelectorAll('[id]').forEach(node=>{const old=node.id,next=prefix+old;ids.set(old,next);node.id=next;});
  copy.querySelectorAll('*').forEach(node=>{for(const attribute of Array.from(node.attributes)){
   let value=attribute.value.replace(/url\((['"]?)#([^)'"\s]+)\1\)/g,(_all,quote,id)=>`url(${quote}#${ids.get(id)??id}${quote})`);
   if(['href','xlink:href'].includes(attribute.name)&&value.startsWith('#'))value='#'+(ids.get(value.slice(1))??value.slice(1));
   if(['for','list','headers','aria-labelledby','aria-describedby'].includes(attribute.name))value=value.split(' ').map(id=>ids.get(id)??id).join(' ');
   if(value!==attribute.value)node.setAttribute(attribute.name,value);
  }});
  copy.querySelectorAll('input,textarea,select,button,a,[contenteditable]').forEach(node=>{node.setAttribute('tabindex','-1');node.removeAttribute('name');node.removeAttribute('autofocus');});
  snapshot.append(copy);
  return snapshot;
 }
 componentDidUpdate(previous:Props,_state:{},snapshot:HTMLDivElement|null){
  if(this.restoreFocus){
   this.restoreFocus=false;
   if(document.activeElement===document.body||!document.activeElement?.isConnected){
    const destination=this.content.current?.querySelector<HTMLElement>('h1,h2')??this.content.current;
    if(destination){destination.tabIndex=-1;destination.focus({preventScroll:true});}
   }
  }
  if(previous.routeKey===this.props.routeKey)return;
  const content=this.content.current,root=this.root.current;
  if(!content||!root)return;
  this.watchContent();
  if(snapshot){
   this.outgoing=snapshot;root.append(snapshot);
   snapshot.querySelectorAll<HTMLElement>('[data-snapshot-scroll]').forEach(node=>{const [top,left]=JSON.parse(node.dataset.snapshotScroll!);node.scrollTop=top;node.scrollLeft=left;delete node.dataset.snapshotScroll;});
   const reduced=shouldReduceMotion();
   const exit=snapshot.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:`translateY(${reduced?0:-3}px)`}],{duration:reduced?160:220,easing:'ease-out',fill:'forwards'});
   this.exiting=exit;
   void exit.finished.then(()=>{if(this.outgoing===snapshot){snapshot.remove();this.outgoing=null;this.exiting=null;exit.cancel();}},()=>{});
  }
  this.reveal();
 }
 componentWillUnmount(){this.observer?.disconnect();this.stop();}
 render(){return <div className="page-surface route-stage" ref={this.root}><div className="route-content" ref={this.content} key={this.props.routeKey} onAnimationEnd={event=>{if(event.target===event.currentTarget){event.currentTarget.classList.remove('route-fallback');event.currentTarget.dataset.routePhase='settled';}}}>{this.props.children}</div></div>;}
}
