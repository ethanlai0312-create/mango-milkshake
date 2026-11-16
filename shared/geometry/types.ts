/** Persisted mathematical coordinates. Viewport transforms never modify these values. */
export type Point = {x:number;y:number;pressure?:number;tiltX?:number;tiltY?:number;time?:number};
export type DrawingMode = 'free'|'strict';
export type PenKind = 'ballpoint'|'highlighter'|'pencil'|'fountain';
export type GeometryType = 'point'|'segment'|'line'|'ray'|'circle'|'arc'|'ellipse'|'triangle'|'isoscelesTriangle'|'equilateralTriangle'|'rightTriangle'|'rectangle'|'square'|'parallelogram'|'rhombus'|'trapezoid'|'polygon'|'angle'|'length'|'text'|'stroke'|'highlight';
export type GeometryLayer = 'initial'|'geometry'|'handwriting'|'highlight'|'reference';
export type ObjectStyle = {color:string;width:number;opacity:number;lineStyle:'solid'|'dashed'|'dotted';fill?:string};
export type PointAnchor = {kind:'point';objectId:string;pointIndex?:number}|{kind:'intersection';objectIds:[string,string];index:number}|{kind:'free';point:Point};
export type RadiusSource = {kind:'opening'}|{kind:'points';anchors:[PointAnchor,PointAnchor]}|{kind:'segment';objectId:string};
export type GeometryObject = {
 id:string;type:GeometryType;points:Point[];style:ObjectStyle;locked:boolean;layer:GeometryLayer;dependencies:string[];
 visible?:boolean;auxiliary?:boolean;center?:Point;radius?:number;radiusX?:number;radiusY?:number;rotation?:number;
 /** Radians, in mathematical model coordinates; sweep is signed and may cross 2π. */
 startAngle?:number;sweep?:number;pen?:PenKind;text?:string;labels?:string[];showLabels?:boolean;showMeasurements?:boolean;createdByStep?:string;
};
export type RulerPose = {origin:Point;angle:number;length?:number;anchors?:[PointAnchor,PointAnchor]};
export type InstrumentKind = 'ruler'|'compass'|'setSquare45'|'setSquare30'|'protractor';
export type CompassPose = {center:Point;radius:number;angle:number;phase:'position'|'opening'|'ready'|'drawing';penDown?:boolean;centerAnchor?:PointAnchor;radiusSource?:RadiusSource;startAngle?:number;sweep?:number};
export type ToolState = {activeTool?:string;visibleInstruments?:InstrumentKind[];ruler?:RulerPose;compass?:CompassPose;setSquare?:RulerPose&{variant?:'45'|'30'};setSquare45?:RulerPose;setSquare30?:RulerPose;protractor?:RulerPose;pen?:{position:Point;angle:number;kind?:PenKind}};
export type ConstructionOperation = 'tool'|'create'|'update'|'delete'|'erase'|'undo'|'redo'|'import';
export type ConstructionParameters = {anchors?:PointAnchor[];centerAnchor?:PointAnchor;radiusSource?:RadiusSource;motion?:Point[];startAngle?:number;sweep?:number;targetStepId?:string;gesture?:'select'|'move'|'rotate'|'opening'|'lock'|'draw'|'finish';[key:string]:unknown};
/** Audit binding only. This client-supplied field never grants permissions. */
export type ConstructionContext = {questionId?:string;attemptId?:string;actorId?:string;role?:'participant'|'author'|'reviewer'};
export type ConstructionStep = {
 version:1;id:string;index:number;operation:ConstructionOperation;tool:string;objectIds:string[];before:GeometryObject[];after:GeometryObject[];removedIds:string[];
 toolBefore?:ToolState;toolAfter?:ToolState;parameters?:ConstructionParameters;createdAt:number;description?:string;context?:ConstructionContext;
 objectOrderBefore?:string[];objectOrderAfter?:string[];
};
export type DrawingDocument = {version:2;mode:DrawingMode;objects:GeometryObject[];steps:ConstructionStep[];toolState?:ToolState;legacy?:boolean};
export type GeometryDocument = DrawingDocument;
export type LegacyShape = {id:string;tool:string;points:Point[];color:string;width:number;text?:string};
export type DrawingInput = DrawingDocument|LegacyShape[]|null|undefined;
export type DrawingValidationOptions = {mode?:DrawingMode;initial?:unknown;allowLegacy?:boolean;context?:ConstructionContext;maxObjects?:number;maxSteps?:number};
export type RecordStepInput = {operation:ConstructionOperation;tool:string;objects?:GeometryObject[];after?:GeometryObject[];removeIds?:string[];toolState?:ToolState;parameters?:ConstructionParameters;description?:string;context?:ConstructionContext;id?:string;createdAt?:number};
export type ObjectOptions = Partial<Omit<GeometryObject,'id'|'type'|'points'|'style'>> & {id?:string;style?:Partial<ObjectStyle>};
export type SnapKind = 'point'|'endpoint'|'intersection'|'center'|'midpoint'|'onLine'|'onCircle'|'grid'|'horizontal'|'vertical'|'angle'|'parallel'|'equalLength';
export type SnapResult = {point:Point;kind:SnapKind;distance:number;objectIds:string[];anchor?:PointAnchor;label:string};
export type SnapOptions = {mode?:DrawingMode;zoom?:number;threshold?:number;pointerType?:string;grid?:number;origin?:Point;angles?:number[];previous?:SnapResult|null;excludeIds?:string[]};
