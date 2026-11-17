import {it,expect,vi,afterEach} from 'vitest';
const state=vi.hoisted(()=>({role:'visitor',account:'account-a',calls:[] as string[]}));
vi.mock('../../src/lib/api',()=>({api:vi.fn(async(action:string)=>{state.calls.push(action);return []})}));
vi.mock('../../src/lib/read-cache',()=>({peekRead:()=>undefined,captureReadCacheScope:()=>({accountId:state.account}),getReadCacheAccount:()=>state.account,getReadCacheRole:()=>state.role}));
import{preparePage,prepareNavigation}from'../../src/lib/page-preload';
afterEach(()=>{state.calls=[];state.role='visitor';});
it.each(['visitor','tester'])('%s never preloads privileged management data',async role=>{state.role=role;for(const p of ['review','users','invites','grading','trash','logs','config'])await preparePage(p);expect(state.calls).toEqual([]);});
it('primary admin warms only allowed list data and does not cache user directory/configuration',async()=>{state.role='admin';await preparePage('review');await preparePage('users');await preparePage('config');expect(state.calls).toEqual(['exams']);});

it.each(['visitor','tester','secondary_admin'])('%s navigation never reads management records',async role=>{state.role=role;for(const page of ['users','config'])expect(await prepareNavigation(page)).toBeUndefined();expect(state.calls).toEqual([]);});
it('primary admin receives one-navigation directory data without caching it',async()=>{state.role='admin';expect(await prepareNavigation('users')).toEqual({rows:[]});expect(state.calls).toEqual(['users']);});
it('notebook is ready before its route is revealed',async()=>{expect(await prepareNavigation('mistakes')).toEqual({exams:[],rows:[]});expect(state.calls).toEqual(['mistakeExams']);});

it('secondary preloads only review and submitted business history, never accounts/configuration/invitations/logs/trash',async()=>{state.role='secondary_admin';for(const p of ['review','grading','users','config','invites','logs','trash'])await preparePage(p);expect(state.calls).toEqual(['exams','historyQuery']);});
