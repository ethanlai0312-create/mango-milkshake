import type {Point} from '../../../shared/geometry';

/** Winding-aware interior angles; concave vertices must exceed 180 degrees. */
export function interiorAngles(points:Point[]){
 const winding=Math.sign(points.reduce((sum,p,i)=>sum+p.x*points[(i+1)%points.length].y-p.y*points[(i+1)%points.length].x,0))||1;
 return points.map((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],u={x:a.x-p.x,y:a.y-p.y},v={x:b.x-p.x,y:b.y-p.y};
  const minor=Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)||1))));
  return (u.x*v.y-u.y*v.x)*winding>0?Math.PI*2-minor:minor;
 });
}

/** Search short radial placements, keeping labels apart and away from vertices. */
export function vertexLabelPositions(points:Point[],labels:string[],zoom=1){
 const center={x:points.reduce((s,p)=>s+p.x,0)/(points.length||1),y:points.reduce((s,p)=>s+p.y,0)/(points.length||1)},placed:{x:number;y:number;width:number}[]=[];
 return labels.map((label,i)=>{const p=points[i];if(!p)return undefined;const preferred=Math.atan2(p.y-center.y,p.x-center.x),width=Math.max(12,label.length*12)/zoom;
  let best={x:p.x+12/zoom,y:p.y-12/zoom},cost=Infinity;
  for(const radius of [19,30,43])for(const offset of [0,-Math.PI/4,Math.PI/4,-Math.PI/2,Math.PI/2,Math.PI]){
   const angle=preferred+offset,q={x:p.x+Math.cos(angle)*radius/zoom,y:p.y+Math.sin(angle)*radius/zoom};
   const collisions=placed.filter(r=>Math.abs(q.y-r.y)<17/zoom&&Math.abs(q.x-r.x)<(width+r.width)/2+5/zoom).length;
   const near=points.filter((v,j)=>j!==i&&Math.hypot(q.x-v.x,q.y-v.y)<17/zoom).length,score=collisions*1000+near*100+radius+Math.abs(offset)*4;
   if(score<cost){best=q;cost=score;}
  }
  placed.push({...best,width});return best;
 });
}
