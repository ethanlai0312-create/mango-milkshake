/** One press may move between destinations; only its final release can activate. */
export const NAV_LABEL_DELAY_MS=150;
export const NAV_COMPACT_QUERY='(max-width:800px), (max-height:540px) and (pointer:coarse)';
export class NavigationPress {
 private pointer:number|null=null;
 private startedAt=0;
 private revealed=false;
 private target:string|null=null;
 private originY=0;
 private lastY=0;
 private scrolling=false;
 start(pointer:number,target:string,now=Date.now(),y=0){if(this.pointer!==null)return false;this.pointer=pointer;this.target=target;this.startedAt=now;this.revealed=false;this.originY=this.lastY=y;this.scrolling=false;return true;}
 preview(pointer:number,now=Date.now()){if(pointer!==this.pointer||this.scrolling||(!this.revealed&&now-this.startedAt<NAV_LABEL_DELAY_MS))return null;this.revealed=true;return this.target;}
 drag(pointer:number,y:number,now=Date.now()){
  if(pointer!==this.pointer)return null;
  if(!this.scrolling&&!this.revealed&&now-this.startedAt<NAV_LABEL_DELAY_MS&&Math.abs(y-this.originY)>8)this.scrolling=true;
  if(!this.scrolling)return null;
  this.target=null;const delta=this.lastY-y;this.lastY=y;return delta;
 }
 move(pointer:number,target:string|null){if(pointer!==this.pointer)return false;if(!this.scrolling)this.target=target;return true;}
 finish(pointer:number,cancel=false){if(pointer!==this.pointer)return null;const target=cancel?null:this.target;this.pointer=null;this.target=null;return target;}
}
