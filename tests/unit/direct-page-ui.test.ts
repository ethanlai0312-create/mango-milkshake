import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {setReadCacheAccount} from '../../src/lib/read-cache';
vi.mock('../../src/lib/api',()=>({api:vi.fn()}));
vi.mock('../../src/components/Upload',()=>({Upload:()=>createElement('button',null,'选择或拖入文件')}));
import {Admin} from '../../src/pages/Admin';
import {HistoryPage} from '../../src/pages/History';
import {Files} from '../../src/pages/Files';
import {ConversionCenter} from '../../src/pages/ConversionCenter';
import {DocumentFrame} from '../../src/components/DocumentFrame';

beforeEach(()=>setReadCacheAccount());
describe('normal page controls before the first authorized data response',()=>{
 it('shows admin search and table columns instead of a loading or false empty result',()=>{
  const html=renderToStaticMarkup(createElement(Admin,{mode:'review',onEdit:()=>{}}));
  expect(html).toContain('搜索记录');expect(html).toContain('<th>操作</th>');expect(html).toContain('data-page-pending="true"');
  expect(html).not.toMatch(/loading-state|加载中|暂无记录/);
 });
 it('shows history filters and statistics without inventing a zero score or count',()=>{
  const html=renderToStaticMarkup(createElement(HistoryPage,{onOpen:()=>{}}));
  expect(html).toContain('全部试卷');expect(html).toContain('最近提交优先');expect(html).toContain('累计完成');
  expect(html).toContain('<h2>—</h2>');expect(html).not.toMatch(/loading-state|加载中|还没有符合/);
 });
 it('makes the shared-file filters and authorized upload control available immediately',()=>{
  const html=renderToStaticMarkup(createElement(Files,{user:{role:'admin'}}));
  expect(html).toContain('上传共享档案');expect(html).toContain('分类筛选');expect(html).toContain('搜索文件名称');
  expect(html).not.toMatch(/loading-state|加载中|暂无共享档案/);
 });
 it('makes conversion upload and selection controls independent of job-list requests',()=>{
  const html=renderToStaticMarkup(createElement(ConversionCenter));
  for(const label of ['上传文档','待转换文件','转换记录','选择或拖入文件'])expect(html).toContain(label);
  expect(html).not.toMatch(/loading-state|加载中|正在读取|暂无文件|暂无转换记录/);
 });
 it('keeps document navigation available but disallows edits before document verification',()=>{
  const html=renderToStaticMarkup(createElement(DocumentFrame,{kind:'editor',onClose:()=>{}}));
  expect(html).toContain('试卷编辑器');expect(html).toContain('题目导航');expect(html).toContain('<fieldset disabled="">');
  expect(html).not.toMatch(/loading-state|加载中/);
 });
});
