export type MotionPoint={x:number;y:number};
export type MotionRect={left:number;top:number;width:number;height:number};
export type PageMotionGeometry={origin?:MotionPoint;rect:MotionRect;viewport:{width:number;height:number}};

/** Reduced motion removes spatial movement, while retaining a short visual handoff. */
export function pageMotion(reduced:boolean,geometry?:PageMotionGeometry){
 const distance=reduced?0:8;
 const base={mode:reduced?'reduced':'full',duration:reduced?180:280,distance,fromOpacity:reduced?.25:0,easing:'cubic-bezier(.2,.7,.2,1)',
  fromTransform:`translate3d(0,${distance}px,0)`,toTransform:'translate3d(0,0,0) scale(1)',transformOrigin:'50% 50%',scale:1,translation:{x:0,y:distance}};
 const origin=geometry?.origin,rect=geometry?.rect,viewport=geometry?.viewport;
 if(reduced||!origin||!rect||!viewport||![origin.x,origin.y,rect.left,rect.top,rect.width,rect.height,viewport.width,viewport.height].every(Number.isFinite)||rect.width<=0||rect.height<0||viewport.width<=0||viewport.height<=0)return base;
 const source={x:Math.max(0,Math.min(viewport.width,origin.x)),y:Math.max(0,Math.min(viewport.height,origin.y))};
 // Use the visible portion of long pages, rather than their offscreen midpoint.
 const visibleTop=Math.max(0,Math.min(viewport.height,rect.top)),visibleBottom=Math.max(visibleTop,Math.min(viewport.height,rect.top+rect.height));
 const focus={x:rect.left+rect.width/2,y:(visibleTop+visibleBottom)/2};
 const nearby=Math.hypot(focus.x-source.x,focus.y-source.y)<200,compact=viewport.width<=800;
 const scale=(compact||nearby)?0.1:0.075;
 // With transform-origin at the icon, this translation puts the visible centre at it too.
 const translation={x:-scale*(focus.x-source.x),y:-scale*(focus.y-source.y)};
 return {...base,mode:'flight',duration:compact||nearby?360:400,distance:0,fromOpacity:.08,scale,translation,
  transformOrigin:`${source.x-rect.left}px ${source.y-rect.top}px`,
  fromTransform:`translate3d(${translation.x}px,${translation.y}px,0) scale(${scale})`};
}

/** Readiness is for deferred history scroll only, never for replaying an entrance animation. */
export class RouteReadiness{
 constructor(private pending=false){}
 reset(loading:boolean){this.pending=loading;}
 update(loading:boolean){const ready=this.pending&&!loading;this.pending=loading;return ready;}
}

/** Retry a browser-clamped history position when real content is ready, never on a timer. */
export class RouteScrollRestore{
 private target:number|null=null;
 reset(top:number){this.target=Number.isFinite(top)?Math.max(0,top):0;}
 cancel(){this.target=null;}
 restore(read:()=>number,write:(top:number)=>void,ready:boolean){
  if(this.target===null)return false;
  const before=read();write(this.target);
  if(ready)this.target=null;
  return Math.abs(read()-before)>1;
 }
}
