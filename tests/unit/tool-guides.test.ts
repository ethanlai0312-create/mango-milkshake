import {describe,it,expect} from 'vitest';
import {GUIDE_GROUPS,GUIDE_TOPICS,findGuideTopics} from '../../src/components/tool-guide/topics';
import {PEN_TOOLS,SHAPE_TOOLS,TOOL_LABELS} from '../../src/components/geometry/editor-types';

describe('工具教程完整性与检索',()=>{
 it('覆盖当前画板的每种工具与快捷图形，且教程ID唯一',()=>{
  const ids=GUIDE_TOPICS.map(t=>t.id);
  expect(new Set(ids).size).toBe(ids.length);
  for(const tool of ['select','pan',...PEN_TOOLS,'eraser','ruler','compass','setSquare45','setSquare30','protractor',...SHAPE_TOOLS]){
   expect(GUIDE_TOPICS.find(t=>t.id===tool)?.name).toBe(TOOL_LABELS[tool]);
  }
 });
 it('每项均有真实分步说明、可用模式和有效分类',()=>{
  for(const topic of GUIDE_TOPICS){
   expect(topic.steps.length).toBeGreaterThanOrEqual(3);
   expect(topic.steps.every(step=>step.trim().length>0),topic.id).toBe(true);
   expect(topic.summary.trim(),topic.id).not.toBe('');
   expect(GUIDE_GROUPS.some(group=>group.id===topic.group)).toBe(true);
   expect(['both','free']).toContain(topic.mode);
  }
 });
 it('五种实体工具均提供操作位置示意图',()=>{
  for(const id of ['ruler','compass','setSquare45','setSquare30','protractor'])expect(GUIDE_TOPICS.find(t=>t.id===id)?.diagram).toBe(id);
 });
 it.each(['圆规','圓規','compass','抬筆'])('支持以%s检索圆规',query=>{
  expect(findGuideTopics(query).some(t=>t.id==='compass')).toBe(true);
 });
 it('支持全角、英文大小写和多个关键词，并同时应用分类',()=>{
  expect(findGuideTopics(' ＣＯＭＰＡＳＳ  抬笔 ','instruments').map(t=>t.id)).toEqual(['compass']);
  expect(findGuideTopics('圆规','writing')).toEqual([]);
 });
 it('没有匹配时返回空列表，清空检索可恢复全部教程',()=>{
  expect(findGuideTopics('不存在的工具xyz')).toEqual([]);
  expect(findGuideTopics('')).toHaveLength(GUIDE_TOPICS.length);
 });
 it('严格模式说明包含限制，且不把快捷图形或测量工具说成严格工具',()=>{
  for(const id of ['compass','ruler','strict'])expect(GUIDE_TOPICS.find(t=>t.id===id)?.mode).toBe('both');
  for(const id of ['protractor','setSquare45','setSquare30',...SHAPE_TOOLS])expect(GUIDE_TOPICS.find(t=>t.id===id)?.mode).toBe('free');
 });
});
