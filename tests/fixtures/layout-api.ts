import type {Page} from '@playwright/test';
import {kinds,newQuestion,type Exam,type Kind} from '../../shared/model';
import {testerExamSummary,testerExamView,testerSharedFile} from '../../shared/roles';

/** Entirely synthetic responses. No request from this fixture can mutate the running API. */
export async function installLayoutApi(page:Page,role:'admin'|'visitor'|'tester'|'secondary_admin'='admin'){
 const userId='60000000-0000-4000-8000-000000000001';
 const examId='60000000-0000-4000-8000-000000000002';
 const attemptId='60000000-0000-4000-8000-000000000003';
 const profile={id:userId,login_id:'Layout 1234',username:'排版檢查_長帳號_LayoutAudit',role,active:true,must_change_password:false,
  id_notice_seen:true,avatar_code:1,avatar:{color:'#ffbd45',hat:'cap',glasses:true},avatar_path:null,
  settings:{language:'zh-CN',theme:'dark'}};
 const sessionId='60000000-0000-4000-8000-000000000004';
 const exp=Math.floor(Date.now()/1000)+10800;
 const token='e30.'+Buffer.from(JSON.stringify({session_id:sessionId,exp})).toString('base64url')+'.eA';
 const session={access_token:token,refresh_token:'synthetic-layout-refresh',expires_in:10800,expires_at:exp,
  token_type:'bearer',user:{id:userId,email:'layout@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated',created_at:new Date().toISOString()}};
 const questions=(Object.keys(kinds) as Kind[]).map((kind,index)=>({...newQuestion(kind),
  id:`60000000-0000-4000-8001-${String(index+1).padStart(12,'0')}`,
  prompt:`<p>第 ${index+1} 題 · ${kinds[kind]}，請按照題意完成。這是一段用來檢查換行、對齊與版面的合成內容。</p>`,
  explanation:'<p>參考解析與補充內容。</p>',points:1,
  ...(kind==='blank'?{answer:['範例']}:{}),
  ...(kind==='single'?{answer:0}:{}),
  ...(kind==='multiple'?{answer:[0,1]}:{}),
 }));
 let exam:Exam={id:examId,owner_id:userId,title:'版面測試試卷 · 綜合題型與長文字響應式檢查',
  description:'合成資料，檢查排版。',subject:'AI',tags:['排版'],status:'draft',revision:1,questions,
  time_limit:0,repeat_allowed:true,reveal_answers:true,show_explanations:true,
  published_version_id:'60000000-0000-4000-8000-000000000005'};
 const now=new Date().toISOString();
 let attempt={id:attemptId,exam_id:examId,user_id:userId,revision:1,started_at:now,submitted_at:null,
  answers:{},grades:{},comments:{},duration_seconds:105,score:15,max_score:15,grading_status:'final'};
 const filename='非常長的檔案名稱_LayoutAudit_排版檢查_'.repeat(3)+'.docx';
 const file={id:'60000000-0000-4000-8000-000000000006',name:filename,size:524288,
  created_at:now,category:'課程資料',description:'長檔案名稱與操作按鈕排列',verified:true};
 const history={filters:[{id:exam.published_version_id,title:exam.title,number:1}],
  stats:{count:2,best_percent:100,best_score:15,total_seconds:210,fastest_seconds:105},
  rows:[{id:attemptId,title:exam.title,username:profile.username,attempt_number:1,version_number:1,
   score:15,max_score:15,duration_seconds:105,submitted_at:now,grading_status:'final'}]};
 let loggedIn=false;
 await page.route('**/backend/session',route=>{if(route.request().method()==='DELETE'){loggedIn=false;return route.fulfill({status:204});}return route.fulfill({json:{session:loggedIn?session:null}});});
 const requests:string[]=[],tabs=new Map<string,boolean>();
 await page.route('**/auth/v1/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/logout'))return route.fulfill({status:204});
  return route.fulfill({json:url.pathname.endsWith('/user')?session.user:{...session,user:session.user}});
 });
 await page.route('**/functions/v1/api',async route=>{
  const body=route.request().postDataJSON();requests.push(body.action);
  const timing={server_time:new Date().toISOString(),idle_expires_at:new Date(Date.now()+3600000).toISOString()};
  if(body.action==='register'){loggedIn=true;Object.assign(profile,{role:'visitor',username:body.nickname,login_id:'Invitation 4321',id_notice_seen:false});return route.fulfill({json:{session,profile,...timing}});}
  if(body.action==='login'){loggedIn=true;return route.fulfill({json:{session,profile,...timing}});}
  let data:any=[];
  switch(body.action){
   case 'me':data=profile;break;case 'ackLoginIdNotice':profile.id_notice_seen=true;data={ok:true};break;
   case 'presence':tabs.set(body.tab,body.online);data={ok:true};break;
   case 'userPresence':data=body.ids.map((id:string)=>({user_id:id,is_online:id===userId&&[...tabs.values()].some(Boolean)}));break;
   case 'exams':{const row={...exam,status:body.mode==='trash'?'deleted':body.mode==='admin'?'pending':body.mode==='public'?'published':'draft'};data=[role==='tester'?testerExamSummary(row):row];break;}
   case 'testerExam':data=testerExamView({...exam,status:'published'});break;
   case 'getExam':data=exam;break;
   case 'saveExam':exam={...body.exam,revision:exam.revision+1};data=exam;break;
   case 'createExam':data=exam;break;
   case 'startAttempt':data={attempt,exam};break;
   case 'attempt':data={exam,attempt};break;
   case 'saveAttempt':attempt={...attempt,answers:body.answers,revision:attempt.revision+1};data=attempt;break;
   case 'historyQuery':data=history;break;
   case 'rank':case 'ranking':case 'leaderboard':data=[{...profile,user_id:userId,rank:1,score:15,max_score:15,duration_seconds:105},{...profile,id:'60000000-0000-4000-8000-000000000007',user_id:'60000000-0000-4000-8000-000000000007',username:'長名稱'.repeat(14),role:'visitor',rank:2,score:14,max_score:15,duration_seconds:106}];break;
   case 'users':data=[{...profile,is_online:[...tabs.values()].some(Boolean)},{...profile,id:'60000000-0000-4000-8000-000000000008',username:'訪客帳號'.repeat(10),role:'visitor'}];break;
   case 'invites':data=[{id:examId,login_id:'Invitation 4321',label:'課程註冊',used:0,max_uses:1,expires_at:new Date(Date.now()+86400000).toISOString(),created_at:now,revoked:false}];break;
   case 'logs':data=[{id:examId,event:'save_exam',entity_id:examId,created_at:now}];break;
   case 'config':data=[{key:'registration_enabled',value:true},{key:'converter_url',value:''}];break;
   case 'files':case 'conversionInputs':data=[role==='tester'?testerSharedFile(file):file];break;
   case 'conversions':data=[{id:examId,status:'completed',input_file_id:file.id,files:file,target:'pdf',created_at:now,completed_at:now,expires_at:new Date(Date.now()+86400000).toISOString()},{id:attemptId,status:'queued',input_file_id:file.id,files:file,target:'pdf',created_at:now}];break;
   case 'conversionInfo':data={configured:true};break;
   case 'settings':Object.assign(profile,{settings:body.settings,...typeof body.nickname==='string'?{username:body.nickname}: {}});data={...profile};break;
   case 'updateAvatar':Object.assign(profile,{avatar:body.avatar??profile.avatar,avatar_path:body.avatar_path??null});data={...profile};break;
  }
  return route.fulfill({json:{data,...timing}});
 });
 return {profile,exam,questions,requests};
}

export async function loginLayoutFixture(page:Page){
 await page.goto('/');
 await page.getByLabel('登录 ID',{exact:true}).fill('Layout 1234');
 await page.getByLabel('密码',{exact:true}).fill('Synthetic-Layout-Password1');
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('heading',{name:/你好/}).waitFor();
}

/** Windows WebKit inherits host display scaling; test the requested CSS viewport, not physical window pixels. */
export async function resizeLayoutViewport(page:Page,size:{width:number;height:number}){
 await page.setViewportSize(size);
 const actual=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
 if(Math.abs(actual.width-size.width)>1||Math.abs(actual.height-size.height)>1)await page.setViewportSize({width:Math.round(size.width*size.width/actual.width),height:Math.round(size.height*size.height/actual.height)});
 await page.waitForFunction(({width,height})=>Math.abs(innerWidth-width)<=1&&Math.abs(innerHeight-height)<=1,size);
}
