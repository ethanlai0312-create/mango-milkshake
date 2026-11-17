import {beforeEach,describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {useCachedPage} from '../../src/pages/useCachedPage';
import {captureReadCacheScope,rememberRead,setReadCacheAccount} from '../../src/lib/read-cache';

const params={search:'',offset:0,category:'',sort:'created_at',ascending:false};
function Probe({query=params,action='files'}:{query?:typeof params;action?:string}){
 const {data,loading}=useCachedPage<any[]>(action,query,[]);
 return createElement('output',{'data-loading':loading},JSON.stringify(data));
}
describe('cached page initial render',()=>{
 beforeEach(()=>{setReadCacheAccount();setReadCacheAccount('visitor-a');});
 it('shows cached records immediately',()=>{
  rememberRead(captureReadCacheScope('visitor-a'),'files',params,[{name:'lesson.pdf'}]);
  const html=renderToStaticMarkup(createElement(Probe));
  expect(html).toContain('data-loading="false"');expect(html).toContain('lesson.pdf');
 });
 it('treats an empty cached result as loaded',()=>{
  rememberRead(captureReadCacheScope('visitor-a'),'files',params,[]);
  expect(renderToStaticMarkup(createElement(Probe))).toContain('data-loading="false"');
 });
 it('does not show a previous filter result under a different query',()=>{
  rememberRead(captureReadCacheScope('visitor-a'),'files',params,[{name:'old-filter.pdf'}]);
  const html=renderToStaticMarkup(createElement(Probe,{query:{...params,category:'new-category'}}));
  expect(html).toContain('data-loading="true"');expect(html).not.toContain('old-filter.pdf');
 });
 it('does not reveal another account records',()=>{
  rememberRead(captureReadCacheScope('visitor-a'),'files',params,[{name:'private-a.pdf'}]);
  setReadCacheAccount('visitor-b');
  const html=renderToStaticMarkup(createElement(Probe));
  expect(html).toContain('data-loading="true"');expect(html).not.toContain('private-a.pdf');
 });
});
