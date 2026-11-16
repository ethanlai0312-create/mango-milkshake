/** The contour is one persistent shape; all states use the same path topology. */
export function navigationContour(base:number,extension:number,center:number,height:number){
 const y=Math.max(0,Math.min(height,center)),top=Math.max(0,y-50),bottom=Math.min(height,y+50),e=Math.max(0,extension),edge=base+e;
 const upper=Math.max(top,y-26),lower=Math.min(bottom,y+26),neck=base+e*.44;
 // Four connected curves: soft shoulders and a continuously rounded droplet nose.
 return `M0 0H${base}V${top}C${base} ${top+(upper-top)*.58} ${base+e*.18} ${upper} ${neck} ${upper}C${base+e*.84} ${upper} ${edge} ${y-(y-upper)*.76} ${edge} ${y}C${edge} ${y+(lower-y)*.76} ${base+e*.84} ${lower} ${neck} ${lower}C${base+e*.18} ${lower} ${base} ${bottom-(bottom-lower)*.58} ${base} ${bottom}V${height}H0Z`;
}
/** High-damping spring, integrated from its current velocity when retargeted. */
export function advanceNavigationSpring(value:number,velocity:number,target:number,seconds:number){
 const dt=Math.min(.032,Math.max(0,seconds));
 for(let i=0;i<2;i++){velocity+=((target-value)*420-38*velocity)/.8*(dt/2);value+=velocity*(dt/2);}
 return {value,velocity};
}
