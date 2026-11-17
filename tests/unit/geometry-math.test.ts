import {describe,it,expect} from 'vitest';
import {angleBetween,arcPath,circleCircleIntersections,createObject,distance,intersections,lineCircleIntersections,lineLineIntersection,pointOnArc,pointOnCircle,TAU,unwrapAngle} from '../../shared/geometry';

describe('真实几何交点与连续圆弧',()=>{
 it('区分直线、射线和线段定义域',()=>{
  const a={x:0,y:0},b={x:10,y:0},c={x:20,y:-5},d={x:20,y:5};
  expect(lineLineIntersection(a,b,c,d)).toEqual([{x:20,y:0}]);expect(lineLineIntersection(a,b,c,d,'segment')).toEqual([]);expect(lineLineIntersection(b,a,c,d,'ray')).toEqual([]);
  expect(lineLineIntersection(a,b,{x:0,y:1},{x:10,y:1})).toEqual([]);expect(lineLineIntersection(a,b,a,b)).toEqual([]);
 });
 it('圆与线相切只产生一个稳定交点，不存在时返回空数组',()=>{
  expect(lineCircleIntersections({x:-20,y:10},{x:20,y:10},{x:0,y:0},10)).toEqual([{x:0,y:10}]);
  expect(lineCircleIntersections({x:-20,y:10.1},{x:20,y:10.1},{x:0,y:0},10)).toEqual([]);
  expect(lineCircleIntersections({x:0,y:0},{x:2,y:0},{x:0,y:0},10,'segment')).toEqual([]);
 });
 it('圆圆相切、内含、同心、重合及两交点均有确定语义',()=>{
  expect(circleCircleIntersections({x:0,y:0},10,{x:20,y:0},10)).toEqual([{x:10,y:0}]);
  expect(circleCircleIntersections({x:0,y:0},10,{x:5,y:0},5)).toEqual([{x:10,y:0}]);
  expect(circleCircleIntersections({x:0,y:0},10,{x:0,y:0},10)).toEqual([]);
  expect(circleCircleIntersections({x:0,y:0},10,{x:0,y:0},2)).toEqual([]);
  const pts=circleCircleIntersections({x:0,y:0},10,{x:10,y:0},10);expect(pts).toHaveLength(2);for(const p of pts){expect(distance(p,{x:0,y:0})).toBeCloseTo(10,10);expect(distance(p,{x:10,y:0})).toBeCloseTo(10,10);}
 });
 it('平移到大坐标或缩小图形后仍保留交点',()=>{
  for(const [offset,scale] of [[1e6,1],[-1e6,.01],[0,1e-6]]){
   const center={x:offset,y:offset},radius=10*scale,points=lineCircleIntersections({x:offset-20*scale,y:offset},{x:offset+20*scale,y:offset},center,radius);
   expect(points).toHaveLength(2);for(const p of points)expect(Math.abs(distance(p,center)-radius)).toBeLessThan(Math.max(1e-9,radius*1e-7));
  }
 });
 it('近相切不会出现NaN，退化的定义线不会成为可吸附直线',()=>{
  const points=circleCircleIntersections({x:0,y:0},100,{x:200+1e-10,y:0},100);expect(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
  expect(lineCircleIntersections({x:1,y:1},{x:1,y:1},{x:0,y:0},10)).toEqual([]);
 });
 it('正负扫角跨0°连续，支持多周完整圆',()=>{
  const deg=(x:number)=>x*Math.PI/180;expect(unwrapAngle(deg(359),deg(1))).toBeCloseTo(deg(361),12);expect(unwrapAngle(deg(1),deg(359))).toBeCloseTo(deg(-1),12);
  const center={x:0,y:0};expect(pointOnArc(pointOnCircle(center,20,deg(0)),center,20,deg(350),deg(25))).toBe(true);expect(pointOnArc(pointOnCircle(center,20,deg(180)),center,20,deg(350),deg(25))).toBe(false);
  expect(pointOnArc(pointOnCircle(center,20,deg(355)),center,20,deg(10),deg(-30))).toBe(true);expect(pointOnArc(pointOnCircle(center,20,2),center,20,0,TAU*2)).toBe(true);
  expect(arcPath(center,20,deg(350),TAU).match(/ A /g)).toHaveLength(2);
 });
 it('交点必须属于实际圆弧且与输入对象次序无关',()=>{
  const arc=createObject('arc',[{x:0,y:0},{x:10,y:0}],{startAngle:0,sweep:Math.PI/2}),line=createObject('line',[{x:0,y:-20},{x:0,y:20}]);
  expect(intersections(arc,line)).toHaveLength(1);expect(intersections(arc,line)[0].y).toBeCloseTo(10,12);expect(intersections(arc,line)).toEqual(intersections(line,arc));
 });
 it('夹角计算与58.5°已知角保持内部精度',()=>{
  expect(angleBetween({x:100,y:0},{x:0,y:0},pointOnCircle({x:0,y:0},200,58.5*Math.PI/180))).toBeCloseTo(58.5*Math.PI/180,12);
 });
});
