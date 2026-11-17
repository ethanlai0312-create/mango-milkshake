import {describe, expect, it} from 'vitest';
import {serializeApiRequest,validateApiInput} from '../../shared/api-input';

const id = '00000000-0000-0000-0000-000000000001';

describe('API request contracts', () => {
 const literal='SELECT * FROM lessons; ${course} <b>ICT</b>';
 it.each([
  {action:'login',loginId:literal,password:literal},
  {action:'register',nickname:literal,password:literal,invite:literal},
  {action:'changePassword',currentPassword:literal,newPassword:literal},
  {action:'createInvite',loginId:'NewID',label:literal},
  {action:'exams',search:literal},
  {action:'files',search:literal,category:literal},
  {action:'updateFile',id,name:literal,description:literal,category:literal},
  {action:'upload',purpose:'attachment',name:literal,size:32,mime:'text/plain'},
  {action:'review',id,decision:'return',reason:literal},
  {action:'grade',id,comments:{[id]:literal}},
  {action:'saveAttempt',id,revision:0,answers:{[id]:literal}},
  {action:'workerFinish',id,lease:id,success:false,error:literal},
 ])('preserves text values for $action without interpreting them',body=>{
  expect(validateApiInput(body)).toHaveProperty('action',body.action);
  const {action,...params}=body;
  expect(JSON.parse(serializeApiRequest(action,params))).toEqual(body);
 });
 it('keeps instruction-like field values literal and prevents operation replacement', () => {
  const values = ['SELECT * FROM lessons;', 'Write-Output "ICT 示例"', '${course}', '<b>文字</b>', '=SUM(A1:A2)'];
  for (const title of values) {
   expect(JSON.parse(serializeApiRequest('createExam', {title}))).toEqual({action: 'createExam', title});
  }
  expect(() => serializeApiRequest('createExam', {action: 'health', title: '普通題目'})).toThrow();
  expect(() => serializeApiRequest('createExam', {title: {command: 'sample'}})).toThrow();
  expect(JSON.parse(serializeApiRequest('historyQuery', {version: undefined}))).toEqual({action: 'historyQuery'});
 });

 it('rejects structural control keys, excess nesting and non-finite input', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
   const answers = {[id]: JSON.parse(`{"${key}":{"sample":true}}`)};
   expect(validateApiInput({action: 'saveAttempt', id, revision: 0, answers})).toHaveProperty('status', 400);
  }
  let answer: unknown = '文字';
  for (let i = 0; i < 70; i++) answer = [answer];
  expect(validateApiInput({action: 'saveAttempt', id, revision: 0, answers: {[id]: answer}})).toHaveProperty('status', 400);
  expect(validateApiInput({action: 'saveAttempt', id, revision: 0, answers: {[id]: Infinity}})).toHaveProperty('status', 400);
 });
 it('preserves Chinese and code examples as text', () => {
  const title = '期末 ICT：程式碼、數學與標點（第 2 章）';
  const body = {action: 'createExam', title};
  expect(validateApiInput(body)).toEqual({action: body.action, params: {title}});
 });

 it('rejects wrong shapes, unknown actions and invalid fields', () => {
  for (const body of [null, [], 3, {action: 3}, {action: 'userState', id, active: 'false'},
   {action: 'submitAttempt', id, revision: 0, answers: [], duration: 1800},
   {action: 'settings', settings: {theme: 1}}, {action: 'leaderboard', version: id, offset: -1}]) {
   expect(validateApiInput(body)).toEqual({error: expect.any(String), status: 400});
  }
  expect(validateApiInput({action: 'unknown', title: '普通文字'})).toEqual({error: expect.any(String), status: 404});
 });

 it('allows expected caller defaults, read filters and worker results', () => {
  expect(validateApiInput({action: 'historyQuery', all: false, version: null, sort: 'date', offset: 0})).toHaveProperty('params.version', null);
  expect(validateApiInput({action: 'invites', mode: 'admin', search: '', offset: 0})).toHaveProperty('params.mode', 'admin');
  expect(validateApiInput({action: 'workerFinish', id, lease: id, success: true})).toHaveProperty('params.success', true);
 });

 it('keeps the 2000-question API limit and draft metadata compatibility', () => {
  const exam = {id, owner_id: id, status: 'draft', revision: 0, title: '複習',
   description: '', subject: '', tags: [], time_limit: 0, repeat_allowed: true,
   reveal_answers: false, show_explanations: false, published_version_id: null,
   questions: Array.from({length: 2000}, () => ({prompt: '中英文內容'}))};
  expect(validateApiInput({action: 'saveExam', exam})).toHaveProperty('params.exam.questions.length', 2000);
  expect(validateApiInput({action: 'saveExam', exam: {...exam, questions: [...exam.questions, {}]}})).toHaveProperty('status', 400);
  expect(validateApiInput({action: 'saveExam', exam: {...exam, revision: '0'}})).toHaveProperty('status', 400);
 });

 it('preserves valid large upload requests and validates worker success flags', () => {
  expect(validateApiInput({action: 'upload', purpose: 'conversion', name: '課程.pdf', size: 7 * 1024 ** 3, mime: 'application/pdf'})).toHaveProperty('params.size', 7 * 1024 ** 3);
  expect(validateApiInput({action: 'workerFinish', id, lease: id, success: 1})).toHaveProperty('status', 400);
 });
});
