import type {ConstructionStep,DrawingDocument,DrawingValidationOptions,GeometryObject,Point,PointAnchor,RadiusSource,ToolState} from './types.ts';
import {angleOf,cross,distance,dot,geometryTolerance,nearlyEqual,samePoint,subtract,TAU} from './math.ts';
import {clone,toolAllowed} from './objects.ts';
import {constructionDependencies,lockInitialDrawing} from './document.ts';
import {anchorDependencies,radiusFromSource,resolveAnchor} from './snap.ts';
import {equalData,patchObjects,replayTimeline} from './timeline.ts';

const types=new Set(['point','segment','line','ray','circle','arc','ellipse','triangle','isoscelesTriangle','equilateralTriangle','rightTriangle','rectangle','square','parallelogram','rhombus','trapezoid','polygon','angle','length','text','stroke','highlight']);
const layers=new Set(['initial','geometry','handwriting','highlight','reference']);
const pens=new Set(['ballpoint','highlighter','pencil','fountain']);
const operations=new Set(['tool','create','update','delete','erase','undo','redo','import']);
const objectKeys=new Set(['id','type','points','style','locked','layer','dependencies','visible','auxiliary','center','radius','radiusX','radiusY','rotation','startAngle','sweep','pen','text','labels','showLabels','showMeasurements','createdByStep']);
const stepKeys=new Set(['version','id','index','operation','tool','objectIds','before','after','removedIds','toolBefore','toolAfter','parameters','createdAt','description','context','objectOrderBefore','objectOrderAfter']);
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hasOnly=(v:Record<string,unknown>,keys:Set<string>)=>Object.keys(v).every(k=>keys.has(k));
const finite=(v:unknown,max=1e6)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=max;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(v);
const unique=(list:string[])=>new Set(list).size===list.length;
function ids(v:unknown,max=1000):v is string[]{return Array.isArray(v)&&v.length<=max&&v.every(id)&&unique(v);}
export function validPoint(v:unknown):v is Point {
 return record(v)&&hasOnly(v,new Set(['x','y','pressure','tiltX','tiltY','time']))&&finite(v.x)&&finite(v.y)&&(v.pressure===undefined||finite(v.pressure,1)&&v.pressure>=0)&&(v.tiltX===undefined||finite(v.tiltX,90))&&(v.tiltY===undefined||finite(v.tiltY,90))&&(v.time===undefined||finite(v.time,1e13)&&v.time>=0);
}
function validAnchor(v:unknown):v is PointAnchor {
 if(!record(v))return false;
 if(v.kind==='free')return hasOnly(v,new Set(['kind','point']))&&validPoint(v.point);
 if(v.kind==='point')return hasOnly(v,new Set(['kind','objectId','pointIndex']))&&id(v.objectId)&&(v.pointIndex===undefined||Number.isInteger(v.pointIndex)&&v.pointIndex>=0&&v.pointIndex<20000);
 return v.kind==='intersection'&&hasOnly(v,new Set(['kind','objectIds','index']))&&ids(v.objectIds,2)&&v.objectIds.length===2&&Number.isInteger(v.index)&&v.index>=0&&v.index<1000;
}
function validRadiusSource(v:unknown):v is RadiusSource {
 if(!record(v))return false;
 return v.kind==='opening'?hasOnly(v,new Set(['kind'])):v.kind==='segment'?hasOnly(v,new Set(['kind','objectId']))&&id(v.objectId):v.kind==='points'&&hasOnly(v,new Set(['kind','anchors']))&&Array.isArray(v.anchors)&&v.anchors.length===2&&v.anchors.every(validAnchor)&&v.anchors.every((a:PointAnchor)=>a.kind!=='free');
}
function validStyle(v:unknown){return record(v)&&hasOnly(v,new Set(['color','width','opacity','lineStyle','fill']))&&typeof v.color==='string'&&/^#[\da-f]{6}$/i.test(v.color)&&finite(v.width,80)&&v.width>=.1&&finite(v.opacity,1)&&v.opacity>=0&&['solid','dashed','dotted'].includes(v.lineStyle)&&(v.fill===undefined||v.fill==='none'||typeof v.fill==='string'&&/^#[\da-f]{6}$/i.test(v.fill));}
function validObject(v:unknown):v is GeometryObject {
 return record(v)&&hasOnly(v,objectKeys)&&id(v.id)&&types.has(v.type)&&Array.isArray(v.points)&&v.points.length>0&&v.points.length<=20000&&v.points.every(validPoint)&&validStyle(v.style)&&typeof v.locked==='boolean'&&layers.has(v.layer)&&ids(v.dependencies)&&!v.dependencies.includes(v.id)&&['visible','auxiliary','showLabels','showMeasurements'].every(k=>v[k]===undefined||typeof v[k]==='boolean')&&(v.center===undefined||validPoint(v.center))&&['radius','radiusX','radiusY'].every(k=>v[k]===undefined||finite(v[k])&&v[k]>=0)&&['rotation','startAngle','sweep'].every(k=>v[k]===undefined||finite(v[k],TAU*1000))&&(v.pen===undefined||pens.has(v.pen))&&(v.text===undefined||typeof v.text==='string'&&v.text.length<=1000)&&(v.labels===undefined||Array.isArray(v.labels)&&v.labels.length<=100&&v.labels.every((s:unknown)=>typeof s==='string'&&s.length<=80))&&(v.createdByStep===undefined||id(v.createdByStep));
}
function validRuler(v:unknown,triangle=false){return record(v)&&hasOnly(v,new Set(['origin','angle','length','anchors',...(triangle?['variant']:[])]))&&validPoint(v.origin)&&finite(v.angle,TAU*1000)&&(v.length===undefined||finite(v.length)&&v.length>0)&&(v.anchors===undefined||Array.isArray(v.anchors)&&v.anchors.length===2&&v.anchors.every(validAnchor))&&(!triangle||v.variant===undefined||['45','30'].includes(v.variant));}
function validToolState(v:unknown):v is ToolState|undefined {
 if(v===undefined)return true;if(!record(v)||!hasOnly(v,new Set(['activeTool','visibleInstruments','ruler','compass','setSquare','setSquare45','setSquare30','protractor','pen'])))return false;
 if(v.activeTool!==undefined&&(typeof v.activeTool!=='string'||v.activeTool.length>80))return false;
 if(v.visibleInstruments!==undefined&&(!Array.isArray(v.visibleInstruments)||v.visibleInstruments.length>5||!unique(v.visibleInstruments)||!v.visibleInstruments.every((tool:unknown)=>typeof tool==='string'&&['ruler','compass','setSquare45','setSquare30','protractor'].includes(tool))))return false;
 if(v.ruler!==undefined&&!validRuler(v.ruler)||v.setSquare!==undefined&&!validRuler(v.setSquare,true)||v.setSquare45!==undefined&&!validRuler(v.setSquare45)||v.setSquare30!==undefined&&!validRuler(v.setSquare30)||v.protractor!==undefined&&!validRuler(v.protractor))return false;
 if(v.pen!==undefined&&(!record(v.pen)||!hasOnly(v.pen,new Set(['position','angle','kind']))||!validPoint(v.pen.position)||!finite(v.pen.angle,TAU*1000)||v.pen.kind!==undefined&&!pens.has(v.pen.kind)))return false;
 const c=v.compass;
 return c===undefined||record(c)&&hasOnly(c,new Set(['center','radius','angle','phase','penDown','centerAnchor','radiusSource','startAngle','sweep']))&&validPoint(c.center)&&finite(c.radius)&&c.radius>0&&finite(c.angle,TAU*1000)&&['position','opening','ready','drawing'].includes(c.phase)&&(c.penDown===undefined||typeof c.penDown==='boolean')&&(c.centerAnchor===undefined||validAnchor(c.centerAnchor))&&(c.radiusSource===undefined||validRadiusSource(c.radiusSource))&&['startAngle','sweep'].every(k=>c[k]===undefined||finite(c[k],TAU*1000));
}
function validContext(v:unknown){return v===undefined||record(v)&&hasOnly(v,new Set(['questionId','attemptId','actorId','role']))&&['questionId','attemptId','actorId'].every(k=>v[k]===undefined||id(v[k]))&&(v.role===undefined||['participant','author','reviewer'].includes(v.role));}
function validParameters(v:unknown){
 return v===undefined||record(v)&&hasOnly(v,new Set(['anchors','centerAnchor','radiusSource','motion','startAngle','sweep','targetStepId','gesture']))&&(v.anchors===undefined||Array.isArray(v.anchors)&&v.anchors.length<=10&&v.anchors.every(validAnchor))&&(v.centerAnchor===undefined||validAnchor(v.centerAnchor))&&(v.radiusSource===undefined||validRadiusSource(v.radiusSource))&&(v.motion===undefined||Array.isArray(v.motion)&&v.motion.length<=20000&&v.motion.every(validPoint))&&['startAngle','sweep'].every(k=>v[k]===undefined||finite(v[k],TAU*1000))&&(v.targetStepId===undefined||id(v.targetStepId))&&(v.gesture===undefined||['select','move','rotate','opening','lock','draw','finish'].includes(v.gesture));
}
function validStep(v:unknown):v is ConstructionStep {
 return record(v)&&hasOnly(v,stepKeys)&&v.version===1&&id(v.id)&&Number.isInteger(v.index)&&v.index>=0&&operations.has(v.operation)&&typeof v.tool==='string'&&v.tool.length<=80&&ids(v.objectIds)&&Array.isArray(v.before)&&v.before.length<=1000&&v.before.every(validObject)&&Array.isArray(v.after)&&v.after.length<=1000&&v.after.every(validObject)&&ids(v.removedIds)&&validToolState(v.toolBefore)&&validToolState(v.toolAfter)&&validParameters(v.parameters)&&finite(v.createdAt,1e13)&&v.createdAt>=0&&(v.description===undefined||typeof v.description==='string'&&v.description.length<=1000)&&validContext(v.context)&&(v.objectOrderBefore===undefined||ids(v.objectOrderBefore))&&(v.objectOrderAfter===undefined||ids(v.objectOrderAfter));
}
function parallel(a:Point,b:Point){return Math.abs(cross(a,b))<=1e-8*Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);}
function right(a:Point,b:Point){return Math.abs(dot(a,b))<=1e-8*Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);}
export function geometryConstraintErrors(object:GeometryObject):string[]{
 const p=object.points,tol=geometryTolerance(...p),type=object.type,fail=(reason:string)=>[`对象 ${object.id} ${reason}`];
 if(type==='point')return p.length===1?[]:fail('点必须只有一个位置');
 if(['line','segment','ray','length'].includes(type))return p.length===2&&distance(p[0],p[1])>tol?[]:fail('线的两个定义点不能重合');
 if(type==='circle'||type==='arc'){
  if(!object.center||object.radius===undefined||object.radius<=tol||!samePoint(p[0],object.center,tol))return fail('圆心或半径无效');
  if(p.length>3||p.slice(1).some(point=>Math.abs(distance(point,object.center!)-object.radius!)>Math.max(tol,object.radius!*1e-8)))return fail('圆上定义点与固定半径不一致');
  if(type==='arc'&&(object.startAngle===undefined||object.sweep===undefined||Math.abs(object.sweep)<1e-10))return fail('圆弧起始角或连续扫角无效');
  return [];
 }
 if(type==='ellipse')return object.center&&object.radiusX&&object.radiusY&&p.length<=2?[]:fail('椭圆参数无效');
 if(type==='stroke'||type==='highlight')return object.pen&&pens.has(object.pen)&&(type!=='highlight'||object.pen==='highlighter'&&object.style.opacity>=.15&&object.style.opacity<=.45)?[]:fail('笔型或荧光笔透明度无效');
 if(type==='text')return p.length===1&&typeof object.text==='string'?[]:fail('文本标注无效');
 if(type==='angle')return p.length===3&&distance(p[0],p[1])>tol&&distance(p[2],p[1])>tol?[]:fail('角必须包含两臂和顶点');
 const triangular=['triangle','isoscelesTriangle','equilateralTriangle','rightTriangle'].includes(type),quadrilateral=['rectangle','square','parallelogram','rhombus','trapezoid'].includes(type);
 if(triangular&&p.length!==3||quadrilateral&&p.length!==4||type==='polygon'&&p.length<3)return fail('顶点数量不正确');
 if(triangular||quadrilateral||type==='polygon'){
  const edges=p.map((point,i)=>subtract(p[(i+1)%p.length],point)),lengths=edges.map(e=>Math.hypot(e.x,e.y));
  if(lengths.some(length=>length<=tol)||Math.abs(p.reduce((area,point,i)=>area+cross(subtract(point,p[0]),subtract(p[(i+1)%p.length],p[0])),0))<=tol*tol)return fail('图形退化');
  const equal=(a:number,b:number)=>Math.abs(a-b)<=Math.max(tol,Math.max(a,b)*1e-8);
  if(type==='square'&&(!lengths.every(length=>equal(length,lengths[0]))||!right(edges[0],edges[1])))return fail('正方形约束无效');
  if(type==='rectangle'&&(!right(edges[0],edges[1])||!parallel(edges[0],edges[2])||!parallel(edges[1],edges[3])))return fail('矩形约束无效');
  if((type==='parallelogram'||type==='rhombus')&&(!parallel(edges[0],edges[2])||!parallel(edges[1],edges[3])))return fail('平行四边形约束无效');
  if(type==='rhombus'&&!lengths.every(length=>equal(length,lengths[0])))return fail('菱形边长不相等');
  if(type==='trapezoid'&&!parallel(edges[0],edges[2])&&!parallel(edges[1],edges[3]))return fail('梯形没有平行底边');
  if(type==='equilateralTriangle'&&!lengths.every(length=>equal(length,lengths[0])))return fail('等边三角形约束无效');
  if(type==='isoscelesTriangle'&&!equal(lengths[0],lengths[1])&&!equal(lengths[1],lengths[2])&&!equal(lengths[0],lengths[2]))return fail('等腰三角形约束无效');
  if(type==='rightTriangle'&&!edges.some((edge,i)=>right(edge,edges[(i+1)%3])))return fail('直角三角形约束无效');
 }
 return [];
}
function dependencyErrors(objects:GeometryObject[]){
 const byId=new Map(objects.map(o=>[o.id,o])),visiting=new Set<string>(),visited=new Set<string>();
 const visit=(object:GeometryObject):boolean=>{if(visiting.has(object.id))return false;if(visited.has(object.id))return true;visiting.add(object.id);for(const dep of object.dependencies){const target=byId.get(dep);if(!target||!visit(target))return false;}visiting.delete(object.id);visited.add(object.id);return true;};
 return objects.every(visit)?[]:['几何依赖包含缺失对象或循环'];
}
function migratedObject(doc:DrawingDocument,object:GeometryObject){
 if(doc.mode!=='free'||!doc.legacy||!['stroke','point','segment','line','ray','circle','arc','rectangle','triangle','polygon','text','angle'].includes(object.type))return false;
 const source=doc.steps.find(step=>step.id===object.createdByStep&&step.operation==='import'&&step.tool==='legacy');
 return !!source?.after.some(original=>original.id===object.id&&original.type===object.type);
}
function basicDocumentErrors(value:unknown,options:DrawingValidationOptions={}):string[]{
 if(!record(value)||!hasOnly(value,new Set(['version','mode','objects','steps','toolState','legacy']))||value.version!==2||!['free','strict'].includes(value.mode)||!Array.isArray(value.objects)||value.objects.length>(options.maxObjects??1000)||!value.objects.every(validObject)||!Array.isArray(value.steps)||value.steps.length>(options.maxSteps??3000)||!value.steps.every(validStep)||!validToolState(value.toolState)||(value.legacy!==undefined&&typeof value.legacy!=='boolean'))return ['几何文档结构、样式、工具姿态或数据规模无效'];
 if(!unique(value.objects.map((o:GeometryObject)=>o.id))||!unique(value.steps.map((s:ConstructionStep)=>s.id)))return ['几何对象或步骤ID重复'];
 let samples=value.objects.reduce((n:number,o:GeometryObject)=>n+o.points.length,0);
 for(const step of value.steps){samples+=step.before.reduce((n:number,o:GeometryObject)=>n+o.points.length,0)+step.after.reduce((n:number,o:GeometryObject)=>n+o.points.length,0)+(step.parameters?.motion?.length??0);if(samples>600000)return ['几何轨迹采样总量过大'];}
 return value.objects.flatMap((object:GeometryObject)=>migratedObject(value as DrawingDocument,object)?[]:geometryConstraintErrors(object)).slice(0,10);
}

function strictPoseErrors(step:ConstructionStep,objects:GeometryObject[]):string[]{
 const errors:string[]=[],before=step.toolBefore,after=step.toolAfter;
 for(const state of [before,after])if(state){
  if(state.activeTool&&!toolAllowed(state.activeTool,'strict')&&state.activeTool!=='pan')errors.push('尺规模式包含非法工具');
  if(state.pen||state.protractor||state.setSquare||state.setSquare45||state.setSquare30||state.visibleInstruments?.some(tool=>!['ruler','compass'].includes(tool)))errors.push('尺规模式不能保存自由笔或测量工具姿态');
  if(state.compass){
   const c=state.compass;
   if(c.centerAnchor){const center=resolveAnchor(c.centerAnchor,objects,true);if(!center||!samePoint(center,c.center))errors.push('圆规中心引用无效');}
   if(c.radiusSource&&c.radiusSource.kind!=='opening'){const radius=radiusFromSource(c.radiusSource,objects);if(radius===null||!nearlyEqual(radius,c.radius,1e-8))errors.push('圆规开口不等于所引用的已有距离');}
  }
 }
 if(step.operation!=='tool')return errors;
 const a=before?.compass,b=after?.compass,gesture=step.parameters?.gesture;
 if(b&&!a&&!['position','opening'].includes(b.phase))errors.push('圆规须先定位、调节开口再锁定');
 if(a&&b){
  const changedRadius=!nearlyEqual(a.radius,b.radius,1e-10),changedCenter=!samePoint(a.center,b.center);
  if(a.phase==='drawing'&&(changedRadius||changedCenter))errors.push('圆规绘制过程中圆心和半径必须恒定');
  if(changedRadius&&(gesture!=='opening'||b.phase!=='opening'))errors.push('仅专用开口操作可改变圆规半径');
  if(changedCenter&&gesture!=='move')errors.push('仅整体移动操作可改变圆规位置');
  if(b.phase==='ready'&&a.phase==='opening'&&gesture!=='lock')errors.push('圆规必须明确锁定半径');
  if(b.phase==='drawing'&&!['ready','drawing'].includes(a.phase))errors.push('未锁定半径不能旋转绘图');
 }
 return errors;
}
function strictCreateErrors(step:ConstructionStep,objects:GeometryObject[]):string[]{
 const errors:string[]=[],p=step.parameters;
 if(step.after.length!==1)return ['一个严格尺规步骤只能创建一个几何对象'];
 const object=step.after[0];
 if(object.locked||object.layer!=='geometry'||object.showMeasurements||object.text||object.pen)return ['尺规作图对象层或属性不合法'];
 if(object.createdByStep!==step.id)errors.push('几何对象未绑定真实创建步骤');
 const dependencies=constructionDependencies(p);
 if(!equalData([...object.dependencies].sort(),[...dependencies].sort())||dependencies.some(dep=>!objects.some(o=>o.id===dep)))errors.push('构造依赖与数学引用不一致');
 if(step.tool==='ruler'&&['line','segment','ray'].includes(object.type)){
  if(!p?.anchors||p.anchors.length!==2||p.anchors.some(anchor=>anchor.kind==='free'))return [...errors,'直尺必须引用两个已有端点或合法交点'];
  const a=resolveAnchor(p.anchors[0],objects),b=resolveAnchor(p.anchors[1],objects);
  if(!a||!b||samePoint(a,b)||object.points.length!==2||!samePoint(a,object.points[0])||!samePoint(b,object.points[1]))errors.push('直尺图形与已有两点不一致');
  const ruler=step.toolAfter?.ruler;
  if(ruler&&a&&b){const direction={x:Math.cos(ruler.angle),y:Math.sin(ruler.angle)};if(Math.abs(cross(subtract(b,a),direction))>geometryTolerance(a,b)*10||Math.abs(cross(subtract(a,ruler.origin),direction))>geometryTolerance(a,b,ruler.origin)*10)errors.push('直尺实体方向与作图不一致');}
 }else if(step.tool==='compass'&&(object.type==='circle'||object.type==='arc')){
  const before=step.toolBefore?.compass,after=step.toolAfter?.compass;
  if(!before||!['ready','drawing'].includes(before.phase)||!after)return [...errors,'圆规须先以已有工具步骤锁定半径'];
  if(before.penDown===false||after.penDown===false)errors.push('抬笔定位不能创建圆或圆弧');
  if(!p?.centerAnchor||!p.radiusSource)return [...errors,'圆规缺少中心或开口来源'];
  const center=resolveAnchor(p.centerAnchor,objects,true);
  if(!center||!object.center||!samePoint(center,object.center)||!samePoint(before.center,object.center)||!samePoint(after.center,object.center))errors.push('圆规绘制时圆心移动或引用无效');
  if(object.radius===undefined||!nearlyEqual(before.radius,object.radius,1e-10)||!nearlyEqual(after.radius,object.radius,1e-10))errors.push('圆规绘制半径与锁定开口不一致');
  if(!equalData(before.radiusSource??{kind:'opening'},p.radiusSource)||!equalData(before.centerAnchor??{kind:'free',point:before.center},p.centerAnchor))errors.push('圆规创建引用与锁定姿态不一致');
  if(p.radiusSource.kind!=='opening'){const radius=radiusFromSource(p.radiusSource,objects);if(radius===null||!nearlyEqual(radius,object.radius??0,1e-8))errors.push('圆规长度转移无效');}
  const start=p.startAngle,sweep=p.sweep;
  if(start===undefined||sweep===undefined||Math.abs(sweep)<1e-10)errors.push('圆规缺少连续旋转数据');
  else {
   if(object.type==='arc'&&(!nearlyEqual(object.startAngle??NaN,start)||!nearlyEqual(object.sweep??NaN,sweep)))errors.push('圆弧与记录的连续扫角不一致');
   if(object.type==='circle'&&Math.abs(sweep)<TAU-1e-6)errors.push('完整圆必须实际完成整周旋转');
   if(Math.abs(Math.atan2(Math.sin(after.angle-start-sweep),Math.cos(after.angle-start-sweep)))>1e-7)errors.push('圆规末端姿态与扫角不一致');
  }
  for(const sample of p.motion??[])if(!object.center||Math.abs(distance(sample,object.center)-(object.radius??0))>Math.max(geometryTolerance(sample,object.center)*10,(object.radius??0)*1e-8))errors.push('圆规运动轨迹改变了半径');
 }else errors.push('尺规模式只允许直尺产生线及圆规产生圆或圆弧');
 return errors;
}
function styleOnly(before:GeometryObject,after:GeometryObject){
 const a=clone(before),b=clone(after);for(const object of [a,b]){object.style={color:'#000000',width:1,opacity:1,lineStyle:'solid'};delete object.visible;delete object.showLabels;delete object.auxiliary;}
 return equalData(a,b);
}
function validateLegacy(value:unknown[],mode:string,allowLegacy:boolean){
 if(mode==='strict'||!allowLegacy)return ['此题需保存新版结构化作图步骤'];
 const tools=new Set(['pen','point','segment','line','ray','circle','arc','rectangle','triangle','polygon','text','angle','ruler','setSquare','protractor']);
 return value.length<=1000&&value.every(s=>record(s)&&hasOnly(s,new Set(['id','tool','points','color','width','text']))&&id(s.id)&&tools.has(s.tool)&&Array.isArray(s.points)&&s.points.length>0&&s.points.length<=20000&&s.points.every(validPoint)&&typeof s.color==='string'&&/^#[\da-f]{6}$/i.test(s.color)&&finite(s.width,20)&&s.width>=1&&(s.text===undefined||typeof s.text==='string'&&s.text.length<=1000))&&unique(value.map(s=>(s as GeometryObject).id))?[]:['旧版绘图对象格式无效'];
}

/** Validate submitted raw data. Never call normalizeDrawing before this security boundary. */
export function validateDrawing(value:unknown,options:DrawingValidationOptions={}):string[]{
 const mode=options.mode??(record(value)&&value.mode==='strict'?'strict':'free');
 if(Array.isArray(value))return validateLegacy(value,mode,options.allowLegacy!==false);
 const basic=basicDocumentErrors(value,options);if(basic.length)return basic;
 const doc=value as DrawingDocument,errors:string[]=[];
 if(doc.mode!==mode)errors.push('作图模式与题目规定不一致');
 if(mode==='strict'&&doc.legacy)errors.push('旧版绘图不能冒充严格尺规作图');
 if(doc.legacy&&options.allowLegacy===false)errors.push('此题不接受旧版绘图迁移');
 const initial=lockInitialDrawing(options.initial).objects,initialIds=new Set(initial.map(o=>o.id));
 if(initial.length>1000||initial.some(o=>!validObject(o)))return ['题目初始几何数据无效'];
 for(const object of initial)if(!equalData(doc.objects.find(o=>o.id===object.id),object))errors.push('题目初始图形被修改或删除');
 for(const object of doc.objects)if(object.layer==='initial'&&!initialIds.has(object.id))errors.push('不能自行伪造题目初始图形');
 let objects=clone(initial);const usedIds=new Set(initialIds);
 for(let i=0;i<doc.steps.length;i++){
  const step=doc.steps[i];if(step.index!==i)errors.push('步骤顺序不连续');
  if(options.context&&step.context)for(const key of ['questionId','attemptId','actorId','role'] as const)if(options.context[key]!==undefined&&step.context[key]!==undefined&&options.context[key]!==step.context[key])errors.push('作图步骤不属于当前题目或答卷');
  const affected=[...new Set([...step.before.map(o=>o.id),...step.after.map(o=>o.id),...step.removedIds])];
  if(!equalData([...step.objectIds].sort(),affected.sort())||!unique(step.before.map(o=>o.id))||!unique(step.after.map(o=>o.id)))errors.push('步骤相关对象列表无效');
  if(step.objectIds.some(id=>initialIds.has(id))||step.before.some(o=>o.locked))errors.push('步骤试图修改锁定初始图形');
  if(step.after.some(o=>initialIds.has(o.id)||o.layer==='initial'))errors.push('步骤试图伪造或覆盖初始图形');
  for(const object of step.after)if(!migratedObject(doc,object))errors.push(...geometryConstraintErrors(object));
  if(step.operation==='create'||step.operation==='import'){
   if(step.before.length||step.removedIds.length||!step.after.length||step.after.some(o=>usedIds.has(o.id)))errors.push('创建步骤覆盖了已有对象或没有创建对象');
   step.after.forEach(o=>usedIds.add(o.id));
  }else if(step.operation==='update'){
   if(step.removedIds.length||!step.after.length||step.after.some(o=>!step.before.some(b=>b.id===o.id))||step.before.length!==step.after.length)errors.push('修改步骤对象不一致');
  }else if(step.operation==='delete'){
   if(step.after.length||!step.removedIds.length||!equalData([...step.before.map(o=>o.id)].sort(),[...step.removedIds].sort()))errors.push('删除步骤对象不一致');
  }else if(step.operation==='erase'){
   if(mode==='strict'||step.tool!=='eraser'||!step.before.length||step.before.some(o=>!['stroke','highlight'].includes(o.type))||step.after.some(o=>!['stroke','highlight'].includes(o.type)||o.createdByStep!==step.id)||step.removedIds.some(id=>!step.before.some(o=>o.id===id)))errors.push('局部擦除只能原子替换自由笔迹');
   for(const object of step.after){if(usedIds.has(object.id)&&!step.before.some(o=>o.id===object.id))errors.push('擦除片段复用了已有对象ID');usedIds.add(object.id);}
  }else if(step.operation==='tool'&&(step.before.length||step.after.length||step.removedIds.length))errors.push('工具移动不能直接修改几何对象');
  if(mode==='strict'){
   if(!toolAllowed(step.tool,'strict')&&step.tool!=='pan')errors.push('严格尺规步骤使用了非法工具');
   errors.push(...strictPoseErrors(step,objects));
   if(step.operation==='create')errors.push(...strictCreateErrors(step,objects));
   else if(step.operation==='import')errors.push('严格尺规不允许导入快捷图形');
   else if(step.operation==='update'&&(!['select','ruler','compass'].includes(step.tool)||step.after.some(after=>{const before=step.before.find(b=>b.id===after.id);return !before||!styleOnly(before,after);})))errors.push('严格尺规不能通过修改操作改变几何位置');
  }
  objects=patchObjects(objects,step.after,step.removedIds);
  errors.push(...dependencyErrors(objects));
  if(errors.length>20)break;
 }
 const timeline=replayTimeline(doc.steps,initial);
 errors.push(...timeline.errors);
 if(!equalData(timeline.objects,doc.objects)||!equalData(timeline.toolState,doc.toolState))errors.push('最终对象或工具姿态与步骤重放结果不一致');
 return [...new Set(errors)].slice(0,20);
}
export const drawingError=(value:unknown,options:DrawingValidationOptions={})=>validateDrawing(value,options)[0]??null;

/** Call only after the surrounding question-author permission check. */
export function validateInitialDrawing(value:unknown):string[]{
 if(value===undefined||value===null)return [];
 const errors=basicDocumentErrors(value,{mode:'free'});if(errors.length)return errors;
 const doc=value as DrawingDocument;
 if(doc.mode!=='free')return ['初始图形应在自由配置模式制作'];
 errors.push(...dependencyErrors(doc.objects));
 // A canonical locked seed deliberately has no authoring history.
 if(doc.steps.length)errors.push(...validateDrawing(doc,{mode:'free',initial:doc.objects.filter(o=>o.layer==='initial').length?{version:2,mode:'free',objects:doc.objects.filter(o=>o.layer==='initial'),steps:[]}:undefined,allowLegacy:false}));
 return [...new Set(errors)].slice(0,20);
}
