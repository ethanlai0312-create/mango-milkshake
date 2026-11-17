import {addObject,createDrawing,createObject,intersections,pointOnCircle,resolveAnchor,setToolState,TAU,type DrawingDocument,type GeometryObject,type Point,type PointAnchor,type RadiusSource,type ToolState} from '../../shared/geometry';

/** Real reducer-built construction histories, shared by mathematical/API/browser checks. */
export function compassCircle(doc:DrawingDocument,centerAnchor:PointAnchor,radius:number,radiusSource:RadiusSource={kind:'opening'},start=0,sweep=TAU){
 const center=resolveAnchor(centerAnchor,doc.objects,true);if(!center)throw new Error('Fixture center is not constructible');
 const previous=doc.toolState??{},position:ToolState={...previous,activeTool:'compass',compass:{center,radius:previous.compass?.radius??radius,angle:start,phase:'position',centerAnchor,radiusSource:previous.compass?.radiusSource??{kind:'opening'}}};
 // Moving an instrument retains its opening; a separate handle changes that opening.
 if(position.compass!.radiusSource?.kind!=='opening')position.compass!.radiusSource={kind:'opening'};
 doc=setToolState(doc,position,'compass',{gesture:'move',centerAnchor});
 const opened:ToolState={...position,compass:{...position.compass!,radius,phase:'opening',radiusSource}};
 doc=setToolState(doc,opened,'compass',{gesture:'opening',radiusSource});
 const ready:ToolState={...opened,compass:{...opened.compass!,phase:'ready'}};
 doc=setToolState(doc,ready,'compass',{gesture:'lock'});
 const type=Math.abs(sweep)>=TAU?'circle':'arc',object=createObject(type,[center,pointOnCircle(center,radius,start)],{center,radius,startAngle:start,sweep});
 const motion=Array.from({length:25},(_,i)=>pointOnCircle(center,radius,start+sweep*i/24));
 doc=addObject(doc,object,'compass',{centerAnchor,radiusSource,startAngle:start,sweep,motion},{...ready,compass:{...ready.compass!,angle:start+sweep,phase:'ready',startAngle:start,sweep}});
 return {doc,object:doc.objects.find(o=>o.id===object.id)!};
}
export function rulerLine(doc:DrawingDocument,a:PointAnchor,b:PointAnchor,type:'line'|'segment'|'ray'='line'){
 const first=resolveAnchor(a,doc.objects),second=resolveAnchor(b,doc.objects);if(!first||!second)throw new Error('Fixture straightedge endpoints are not constructible');
 const state:ToolState={...doc.toolState,activeTool:'ruler',ruler:{origin:first,angle:Math.atan2(second.y-first.y,second.x-first.x),anchors:[a,b]}};
 doc=setToolState(doc,state,'ruler',{gesture:'move'});
 const object=createObject(type,[first,second]);doc=addObject(doc,object,'ruler',{anchors:[a,b]},state);
 return {doc,object:doc.objects.find(o=>o.id===object.id)!};
}
function closestIntersection(a:GeometryObject,b:GeometryObject,target:Point):PointAnchor {
 const points=intersections(a,b);if(!points.length)throw new Error('Fixture intersection does not exist');
 let index=0;for(let i=1;i<points.length;i++)if(Math.hypot(points[i].x-target.x,points[i].y-target.y)<Math.hypot(points[index].x-target.x,points[index].y-target.y))index=i;
 return {kind:'intersection',objectIds:[a.id,b.id],index};
}
export function perpendicularBisectorFixture(){
 const given=createObject('segment',[{x:200,y:250},{x:600,y:250}],{labels:['A','B'],showLabels:true});
 const initial=addObject(createDrawing(),given,'segment');
 const a:PointAnchor={kind:'point',objectId:given.id,pointIndex:0},b:PointAnchor={kind:'point',objectId:given.id,pointIndex:1};
 const first=compassCircle(createDrawing('strict',initial),a,250),second=compassCircle(first.doc,b,250);
 const upper=closestIntersection(first.object,second.object,{x:400,y:100}),lower=closestIntersection(first.object,second.object,{x:400,y:400});
 const final=rulerLine(second.doc,upper,lower);
 return {initial,document:final.doc,given,line:final.object,circles:[first.object,second.object],anchors:{a,b,upper,lower}};
}
export function angleBisectorFixture(){
 const vertex={x:240,y:340},armA={x:600,y:340},armB=pointOnCircle(vertex,340,-58.5*Math.PI/180);
 const given=createObject('angle',[armA,vertex,armB],{labels:['A','O','B'],showLabels:true});
 const initial=addObject(createDrawing(),given,'angle');
 const o:PointAnchor={kind:'point',objectId:given.id,pointIndex:1};
 const first=compassCircle(createDrawing('strict',initial),o,150);
 const armPointA=pointOnCircle(vertex,150,0),armPointB=pointOnCircle(vertex,150,-58.5*Math.PI/180);
 const a=closestIntersection(given,first.object,armPointA),b=closestIntersection(given,first.object,armPointB);
 const source:RadiusSource={kind:'points',anchors:[o,a]};
 const left=compassCircle(first.doc,a,150,source),right=compassCircle(left.doc,b,150,source);
 const interior=pointOnCircle(vertex,270,-29.25*Math.PI/180),intersection=closestIntersection(left.object,right.object,interior);
 const final=rulerLine(right.doc,o,intersection,'ray');
 return {initial,document:final.doc,given,line:final.object,circles:[first.object,left.object,right.object],anchors:{o,a,b,intersection},angle:58.5*Math.PI/180};
}
