import {inviteLabelError} from '../../../shared/invite-label.ts';
import {loginId,loginIdKey,loginIdError,nickname,nicknameError} from '../../../shared/identity.ts';
import {nonDestructiveExamChange,isBusinessManager,isTesterRole,roleAllows,testerExamSummary,testerExamView,testerSharedFile} from '../../../shared/roles.ts';
import {createDeliveryMap,deliveredExam,canonicalAnswers,publicAttempt} from '../../../shared/delivery.ts';
import {passwordError,localNewPasswordError,authIpLimit} from '../../../shared/password-security.ts';
import {loginFailureTarget,padLoginFailure,inviteUsable,publicConfiguration,retryAfterSeconds} from '../../../shared/auth-security.ts';
import {validateAnswers} from '../../../shared/answers.ts';
import {bindDrawingAnswers,bindDrawingQuestions} from '../../../shared/drawing-question.ts';
import {buildManualReview,releasedDrawingReferences} from '../../../shared/manual-review.ts';
import {validPresenceId,validPresenceUpdate} from '../../../shared/presence.ts';
import {conversionFormats} from '../../../shared/conversion.ts';
import {inspectFile,extensions} from '../../../shared/files.ts';
import {createClient} from '@supabase/supabase-js';
import {validateExam} from '../../../shared/model.ts';
import {gradeExam} from '../../../shared/grading.ts';
import {validateStructure} from '../../../shared/validation.ts';
import {validateApiInput} from '../../../shared/api-input.ts';
import {PublicApiError,databaseError,publicError} from '../../../shared/public-errors.ts';
import {sanitizeQuestionRichText} from '../../../shared/rich-text.ts';
import {decodeJwt} from 'jose';
const url=Deno.env.get('SUPABASE_URL')!,secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function fail(message:string,status=400,code?:string):never{throw new PublicApiError(message,status,code);}
function check(result:any){if(result.error)throw databaseError(result.error);return result.data;}
async function hiddenUsers(viewer:string):Promise<string[]>{return check(await db.rpc('api_visibility_hidden',{p_viewer:viewer})) as string[];}
async function canSee(viewer:string,owner:string){return !!check(await db.rpc('api_visibility_visible',{p_viewer:viewer,p_owner:owner}));}
async function authorNames(ids:string[]){const unique=[...new Set(ids.filter((id:string)=>typeof id==='string'&&id))];if(!unique.length)return new Map<string,string>();const rows=check(await db.from('profiles').select('id,username').in('id',unique));return new Map(rows.map((p:any)=>[p.id,p.username]));}

async function sessionDeadline(token:string,userId:string,activity:boolean):Promise<string>{
 const id=decodeJwt(token).session_id;
 if(typeof id!=='string')fail('请重新登录',401,'SESSION_EXPIRED');
 const end=check(await db.rpc('api_session_idle_deadline',{p_user:userId,p_session:id,p_activity:activity}));
 if(typeof end!=='string')fail('请重新登录',401,'SESSION_EXPIRED');
 return end;
}
async function storedSize(path:string){const info=check(await db.storage.from('mango-private').info(path));const size=Number(info.size);if(!Number.isSafeInteger(size)||size<1)fail('存储文件大小无效');return size;}
async function storedHeader(path:string){
 const signed=check(await db.storage.from('mango-private').createSignedUrl(path,60));
 const response=await fetch(signed.signedUrl,{headers:{Range:'bytes=0-8191'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)fail('无法校验上传文件');
 const reader=response.body?.getReader();if(!reader)fail('文件内容为空');
 const header=new Uint8Array(8192);let length=0;
 try{while(length<header.length){const part=await reader.read();if(part.done)break;const slice=part.value.subarray(0,header.length-length);header.set(slice,length);length+=slice.length;}}finally{await reader.cancel();}
 return header.subarray(0,length);
}
async function sha(s:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function email(username:string){return `${await sha(username)}@accounts.mango.invalid`;}
class RequestRateLimitError extends PublicApiError{constructor(readonly seconds:number){super('请求过于频繁，请稍后重试',429);}}
async function limited(key:string,limit:number,seconds:number){if(!check(await db.rpc('api_rate_limit',{p_key:key,p_limit:limit,p_seconds:seconds})))throw new RequestRateLimitError(seconds);}
function password(p:string){const error=passwordError(p);if(error)fail(error);}
function newPassword(p:string,name:string){password(p);const error=localNewPasswordError(p,name);if(error)fail(error);}
function identity(value:unknown){const error=loginIdError(value);if(error)fail(error);return loginId(value as string);}
function publicNickname(value:unknown){const error=nicknameError(value);if(error)fail(error);return nickname(value as string);}
async function mutate(actor:string,action:string,data:any){return check(await db.rpc('api_audited_mutation',{p_actor:actor,p_action:action,p_data:data}));}
async function fileAllowed(f:any,profile:any){if(isTesterRole(profile.role)&&f.owner_id!==profile.id){
 if(f.purpose==='shared')return true;if(f.purpose!=='attachment'||!f.exam_id)return false;
 const e=check(await db.from('exams').select('published_version_id').eq('id',f.exam_id).eq('status','published').is('purged_at',null).maybeSingle());if(!e?.published_version_id)return false;
 const v=check(await db.from('exam_versions').select('snapshot').eq('id',e.published_version_id).single());return v.snapshot.questions.some((q:any)=>(q.attachments??[]).includes(f.id));
 }if(f.owner_id===profile.id||f.purpose==='shared'||f.purpose==='avatar')return true;if(f.purpose==='attachment'){if(isBusinessManager(profile.role))return true;if(f.exam_id){const e=check(await db.from('exams').select('owner_id').eq('id',f.exam_id).single());if(e.owner_id===profile.id)return true;}return check(await db.rpc('api_attachment_visible',{p_file:f.id,p_user:profile.id}));}return f.purpose==='submission'&&!!f.attempt_id&&isBusinessManager(profile.role);}
async function drainStorageCleanup(){try{const paths=check(await db.rpc('api_storage_cleanup',{})).map((row:any)=>row.path);if(paths.length){check(await db.storage.from('mango-private').remove(paths));check(await db.rpc('api_storage_cleanup',{p_finished:paths}));}}catch{/* Durable queue remains for the next worker poll; do not fail an already committed action. */}}
function scheduleStorageCleanup(){const pending=drainStorageCleanup();(globalThis as any).EdgeRuntime?.waitUntil(pending);}
async function removeConversion(job:any,user:string|null=null,cleanup=true){check(await db.rpc('api_remove_conversion',{p_id:job.id,p_user:user}));if(cleanup)scheduleStorageCleanup();}
async function validateAttachments(exam:any,me:any){
 const existing=check(await db.from('exams').select('owner_id,purged_at').eq('id',exam.id).single());
 if(existing.purged_at||existing.owner_id!==me.id&&!isBusinessManager(me.role))fail('无权限',403);
 const ids=[...new Set<string>(exam.questions.flatMap((q:any)=>q.attachments))],sources=new Map<string,boolean>();
 for(let i=0;i<ids.length;i+=200){const batch=ids.slice(i,i+200),files=check(await db.from('files').select('id,owner_id,exam_id,purpose,verified').in('id',batch));if(files.length!==batch.length)fail('包含不存在的附件');for(const f of files){if(f.purpose!=='attachment'||!f.verified)fail('只能引用已验证的试卷附件');if(f.owner_id===me.id||isBusinessManager(me.role))continue;if(!sources.has(f.exam_id)){const source=check(await db.from('exams').select('owner_id').eq('id',f.exam_id).single());sources.set(f.exam_id,source.owner_id===me.id);}if(!sources.get(f.exam_id))fail('不能引用其他人的私人附件',403);}}
}
function validatePublication(exam:any){
 const errors=validateExam(exam);
 if(errors.length)fail(errors.join('；'));
 for(const item of exam.questions){
  const clean=sanitizeQuestionRichText(item);
  if(clean.prompt!==item.prompt||clean.explanation!==item.explanation)fail('试卷中含有旧版富文本格式，请重新保存草稿并提交审核');
 }
}
async function ensureDelivery(attempt:any,exam:any){if(!attempt.delivery_map||!Object.keys(attempt.delivery_map).length)attempt.delivery_map=check(await db.rpc('api_set_delivery_map',{p_attempt:attempt.id,p_user:attempt.user_id,p_map:createDeliveryMap(exam)}));return attempt.delivery_map;}
async function converterUrl(){const row=check(await db.from('system_config').select('value').eq('key','converter_url').maybeSingle());return typeof row?.value==='string'&&/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(row.value)?row.value:'';}
async function wakeConverter(){const base=await converterUrl();if(base){const wake=fetch(base+'/wake',{signal:AbortSignal.timeout(5000)}).then(()=>{}).catch(()=>{});(globalThis as any).EdgeRuntime?.waitUntil(wake);}}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 let loginFailureStarted:number|undefined;let failureTarget=0;
 try{
 if(req.method!=='POST')fail('只支持POST',405);
 if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')fail('仅支持 JSON 请求',415);
 if(Number(req.headers.get('content-length')??0)>2_000_000)fail('请求过大',413);
 const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();fail('请求过大',413);}chunks.push(value);}}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 let body:unknown;
 try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('请求格式无效');}
 const request=validateApiInput(body);if(request.error)fail(request.error,request.status);
 const action=request.action,p=request.params as Record<string,any>;
 const ip=req.headers.get('x-forwarded-for')?.split(',')[0]??'unknown';
 if(['workerClaim','workerFinish','workerHealth'].includes(action)){
  const workerToken=req.headers.get('authorization')?.replace(/^Bearer /i,'')??'';
  if(!/^mw_[A-Za-z0-9_-]{32,256}$/.test(workerToken))fail('需要工作器身份验证',401);
  await limited('worker:'+await sha(ip),60,60);
  const testOnly=false;
  if(!check(await db.rpc('api_worker_key_valid',{p_digest:await sha(workerToken)})))fail('需要工作器身份验证',401);
  let result:any=null;
  if(action==='workerHealth'){result={ok:true,test_only:testOnly};}else if(action==='workerClaim'){if(!testOnly){check(await db.rpc('api_expire_uploads',{}));await drainStorageCleanup();}let expiredQuery=db.from('conversion_jobs').select('*').lt('expires_at',new Date().toISOString());if(testOnly){const profiles=check(await db.from('profiles').select('id').eq('is_test_account',true));expiredQuery=expiredQuery.in('user_id',profiles.map((p:any)=>p.id));}const expired=check(await expiredQuery.limit(100));for(const old of expired){if(old.status==='running'&&Date.parse(old.lease_until)>Date.now())continue;await removeConversion(old,null,!testOnly);}
   const job=check(await db.rpc('api_claim_conversion_scoped',{p_test_only:testOnly}));
   if(job?.id){const f=check(await db.from('files').select('*').eq('id',job.input_file_id).single());result={...job,input_name:f.name,input_url:check(await db.storage.from('mango-private').createSignedUrl(f.path,900)).signedUrl,output_url:check(await db.storage.from('mango-private').createSignedUploadUrl(job.output_path)).signedUrl};}
  }else{
   const job=check(await db.from('conversion_jobs').select('*').eq('id',p.id).eq('lease_id',p.lease).eq('status','running').single());
   if(testOnly&&!check(await db.from('profiles').select('is_test_account').eq('id',job.user_id).single()).is_test_account)fail('验收运行器不能处理正式用户文件',403);
   if(Date.parse(job.lease_until)<Date.now())fail('转换租约已过期');
   if(p.success){await storedSize(job.output_path);}
   if(!check(await db.rpc('api_finish_conversion',{p_id:job.id,p_lease:p.lease,p_success:p.success===true,p_error:p.success?null:String(p.error).slice(0,500)})))fail('转换租约或任务状态已变化',409);result={ok:true};
  }
  return new Response(JSON.stringify({data:result,server_time:new Date().toISOString()}),{headers});
 }
 if(action==='health')return new Response(JSON.stringify({ok:true,api:'v1',server_time:new Date().toISOString()}),{headers});
 if(['login','register','bootstrap'].includes(action)){
 if(action==='bootstrap'&&check(await db.from('profiles').select('id').eq('role','admin').limit(1)).length)fail('接口不存在',404);
 await limited('auth:aggregate:'+action,action==='login'?120:action==='register'?45:5,60);
 await limited(`ip:${await sha(ip)}:${action}`,authIpLimit(action),900);
 const rawDevice=req.headers.get('x-mango-device'),device=rawDevice&&/^[A-Za-z0-9_-]{16,128}$/.test(rawDevice)?rawDevice:undefined;if(device)await limited('auth-device:'+await sha(device)+':'+action,action==='login'?40:10,900);
 let issuedId:string|undefined;
 if(action==='register'){
  const invite=check(await db.from('invites').select('login_id,revoked,expires_at,used,max_uses').eq('digest',await sha(String(p.invite).trim())).maybeSingle());
  if(!inviteUsable(invite)||!invite.login_id)fail('密令无效、过期或已用尽');issuedId=invite.login_id;
 }
 if(action==='login'){loginFailureStarted=performance.now();const entropy=new Uint32Array(1);crypto.getRandomValues(entropy);failureTarget=loginFailureTarget(entropy[0]/0xffffffff);}
 let name:string;try{name=identity(action==='register'?issuedId:p.loginId);}catch(error){if(action!=='login')throw error;check(await db.rpc('api_auth_dummy_password',{p_password:p.password}));fail('账号或密码错误',401);}
 if(action!=='login')newPassword(p.password,name);
 if(action==='login'){
 await limited(`login-pair:${await sha(loginIdKey(name)+'\u0000'+ip+'\u0000'+(device??'unavailable'))}`,10,300);
 const profileExists=check(await db.from('profiles').select('id').eq('login_id_key',loginIdKey(name)).maybeSingle());
 if(!profileExists){check(await db.rpc('api_auth_dummy_password',{p_password:p.password}));if(!check(await db.rpc('api_rate_limit',{p_key:'login-failure:'+await sha(loginIdKey(name)),p_limit:30,p_seconds:900})))failureTarget=Math.max(failureTarget,1500);fail('账号或密码错误',401);}
 const client=createClient(url,secret,{auth:{persistSession:false}});
 const identityUser=await db.auth.admin.getUserById(profileExists.id);
 if(identityUser.error||!identityUser.data.user?.email){check(await db.rpc('api_auth_dummy_password',{p_password:p.password}));fail('账号或密码错误',401);}
 const result=await client.auth.signInWithPassword({email:identityUser.data.user.email,password:p.password});
 if(result.error||result.data.user?.id!==profileExists.id){if(!check(await db.rpc('api_rate_limit',{p_key:'login-failure:'+await sha(loginIdKey(name)),p_limit:30,p_seconds:900})))failureTarget=Math.max(failureTarget,1500);fail('账号或密码错误',401);}
 const profile=check(await db.from('profiles').select('*').eq('id',result.data.user.id).single());
 const idleExpiresAt=await sessionDeadline(result.data.session.access_token,profile.id,false);
 if(!profile.active)fail('账号已停用',403);check(await db.from('profiles').update({last_login_at:new Date().toISOString()}).eq('id',profile.id));
 return new Response(JSON.stringify({session:result.data.session,profile,idle_expires_at:idleExpiresAt,server_time:new Date().toISOString()}),{headers});
 }
 if(action==='bootstrap'){
 const hash=await sha(String(p.token));
 const allowed=check(await db.rpc('api_claim_bootstrap',{p_hash:hash}));
 if(!allowed)fail('初始化已禁用',403);
 const user=check(await db.auth.admin.createUser({email:await email(name),password:p.password,email_confirm:true,app_metadata:{provisioned:'mango-v1'}})).user;
 check(await db.from('profiles').insert({id:user.id,username:publicNickname(p.nickname??name),login_id:name,role:'admin'}));
 return new Response(JSON.stringify({ok:true}),{headers});
 }
 const registration=check(await db.from('system_config').select('value').eq('key','registration_enabled').maybeSingle());if(registration?.value===false)fail('管理员已暂停新账号注册');
 const displayName=publicNickname(p.nickname);
 const reservation=check(await db.rpc('api_reserve_identity_registration',{p_login_id:name,p_digest:await sha(String(p.invite).trim())}));
 let id:string|undefined;
 try{const user=check(await db.auth.admin.createUser({email:await email(crypto.randomUUID()),password:p.password,email_confirm:true,app_metadata:{provisioned:'mango-v1'}})).user;id=user.id;check(await db.rpc('api_complete_identity_registration',{p_user:id,p_reservation:reservation,p_nickname:displayName}));}catch(e){
  // A lost RPC response must never remove an account that actually committed.
  const committed=id?await db.from('profiles').select('id,login_id_key').eq('id',id).maybeSingle():null;
  if(committed?.error)fail('注册结果暂时无法确认，请稍后使用ID登录检查',503);
  if(!committed?.data){if(id)check(await db.auth.admin.deleteUser(id));check(await db.rpc('api_release_identity_registration',{p_reservation:reservation}));throw e;}
  if(committed.data.login_id_key!==loginIdKey(name))fail('注册结果暂时无法确认，请稍后使用ID登录检查',503);
 }
 const registered=check(await db.from('profiles').select('*').eq('id',id).single());const identityUser=check(await db.auth.admin.getUserById(id!)).user;const client=createClient(url,secret,{auth:{persistSession:false}});const signed=await client.auth.signInWithPassword({email:identityUser.email!,password:p.password});if(signed.error)return new Response(JSON.stringify({ok:true,registered_id:registered.login_id,login_required:true}),{headers});const idleExpiresAt=await sessionDeadline(signed.data.session.access_token,registered.id,false);return new Response(JSON.stringify({session:signed.data.session,profile:registered,idle_expires_at:idleExpiresAt,server_time:new Date().toISOString()}),{headers});
 }
 const token=req.headers.get('authorization')?.replace(/^Bearer /i,'')??'';
 const auth=await db.auth.getUser(token);if(auth.error&&(auth.error.status===0||(auth.error.status??0)>=500))fail('认证服务暂不可用，请重试',503);
 if(auth.error||!auth.data.user)fail('请重新登录',401,'SESSION_EXPIRED');
 await limited(`user:${auth.data.user.id}`,240,60);
 const sessionId=decodeJwt(token).session_id as string;const idleExpiresAt=await sessionDeadline(token,auth.data.user.id,action==='sessionActivity');const me=check(await db.from('profiles').select('*').eq('id',auth.data.user.id).single());if(!me.active)fail('账号已停用',403);
 if(['mistakeExams','mistakes','testerExam','testerFile','getExam','attempt','startAttempt','leaderboard','historyQuery','history','files','exams','fileUrl','conversionDownload'].includes(action)){
  await limited('read:'+me.id+':'+action,action==='fileUrl'?120:action==='startAttempt'?12:45,60);
 }
 if(me.role==='secondary_admin'&&action==='review'&&!['publish','return'].includes(p.decision))fail('副管理员不能撤销发布或操作回收站',403);
 if(!roleAllows(me.role,action,p))fail('当前权限不能执行此操作',403);
 const admin=()=>{if(me.role!=='admin')fail('需要管理员权限',403);};
 const manager=()=>{if(!isBusinessManager(me.role))fail('需要业务管理权限',403);};
 if(me.must_change_password&&!['me','changePassword','settings','fileUrl','presence','sessionStatus','sessionActivity'].includes(action))fail('请先修改初始或临时密码',403);
 let data:any;
 switch(action){
 case 'sessionStatus':case 'sessionActivity':data={idle_expires_at:idleExpiresAt,server_time:new Date().toISOString()};break;
 case 'ackLoginIdNotice':check(await db.from('profiles').update({id_notice_seen:true}).eq('id',me.id));data={ok:true};break;
 case 'me':data={...me};break;
 case 'settings':{const existing=check(await db.from('profiles').select('avatar,avatar_path').eq('id',me.id).single());p.avatar=existing.avatar;p.avatar_path=existing.avatar_path;if(p.avatar_path){const photo=check(await db.from('files').select('id').eq('id',p.avatar_path).eq('owner_id',me.id).eq('purpose','avatar').eq('verified',true).maybeSingle());if(!photo)fail('头像必须是本人已验证的图片');}const settings={theme:['light','dark','system'].includes(p.settings?.theme)?p.settings.theme:'system',language:['zh-CN','zh-TW'].includes(p.settings?.language)?p.settings.language:'zh-CN'};const avatar={color:/^#[0-9a-f]{6}$/i.test(p.avatar?.color)?p.avatar.color:'#ffbd45',expression:String(p.avatar?.expression??'smile').slice(0,20),hat:['none','cap','bow','flower','headphones'].includes(p.avatar?.hat)?p.avatar.hat:'none',glasses:!!p.avatar?.glasses};data=check(await db.rpc('api_update_identity_settings',{p_user:me.id,p_settings:settings,p_nickname:p.nickname===undefined?me.username:publicNickname(p.nickname)}));break;}
 case 'changePassword':{await limited('reauth:'+me.id,10,900);newPassword(p.newPassword,me.login_id);const c=createClient(url,secret,{auth:{persistSession:false}});const re=await c.auth.signInWithPassword({email:auth.data.user.email!,password:p.currentPassword});if(re.error)fail('当前密码错误',401);const nonce=crypto.randomUUID();check(await db.rpc('api_prepare_password_change',{p_user:me.id,p_actor:me.id,p_nonce_hash:await sha(nonce),p_force:false}));check(await db.auth.admin.updateUserById(me.id,{password:p.newPassword,app_metadata:{provisioned:'mango-v1',password_change_nonce:nonce}}));const fresh=check(await c.auth.signInWithPassword({email:auth.data.user.email!,password:p.newPassword}));data={ok:true,session:fresh.session};break;}
 case 'presence':{if(!validPresenceUpdate(p.tab,p.sequence,p.online))fail('在线状态参数无效');check(await db.rpc('api_presence_touch',{p_user:me.id,p_session:sessionId,p_tab:p.tab,p_sequence:p.sequence,p_online:p.online}));data={ok:true};break;}
 case 'userPresence':{manager();if(!Array.isArray(p.ids)||p.ids.length>50||!p.ids.every(validPresenceId))fail('账号列表无效');data=check(await db.rpc('api_account_presence',{p_users:p.ids}));break;}
 case 'users':{manager();const profiles=check(await db.rpc('api_users_by_role',{p_actor:me.id,p_offset:p.offset??0}));const presence=check(await db.rpc('api_account_presence',{p_users:profiles.map((u:any)=>u.id)}));data=profiles.map((u:any)=>{const row={...u,...presence.find((s:any)=>s.user_id===u.id)};if(me.role!=='admin')delete row.login_id;return row;});break;}
 case 'userVisibility':{manager();data=check(await db.rpc('api_user_visibility',{p_actor:me.id,p_target:p.id}));break;}
 case 'setUserVisibility':{admin();data=check(await db.rpc('api_set_user_visibility',{p_actor:me.id,p_target:p.id,p_blocked:p.blocked??[],p_all:p.all===true}));break;}
 case 'updateAvatar':{const existing=check(await db.from('profiles').select('avatar').eq('id',me.id).single());const a=p.avatar??existing.avatar;const avatar={color:/^#[0-9a-f]{6}$/i.test(a?.color)?a.color:'#ffbd45',expression:['smile','surprise'].includes(a?.expression)?a.expression:'smile',hat:['none','cap','bow','flower','headphones'].includes(a?.hat)?a.hat:'none',glasses:!!a?.glasses};data=check(await db.rpc('api_update_avatar',{p_user:me.id,p_avatar:avatar,p_photo:p.avatar_path??null}));break;}
 case 'purgeAccount':{admin();if(p.confirmPermanent!==true||typeof p.confirmUsername!=='string')fail('需要永久删除确认');data=check(await db.rpc('api_purge_account',{p_actor:me.id,p_target:p.id,p_username:p.confirmUsername}));scheduleStorageCleanup();break;}
 case 'setUserRole':{admin();data=check(await db.rpc('api_set_user_role',{p_actor:me.id,p_target:p.id,p_role:p.role,p_expected:p.expectedRole}));break;}
 case 'testerExam':{const e=check(await db.from('exams').select('id,status,published_version_id').eq('id',p.id).eq('status','published').is('purged_at',null).maybeSingle());if(!e?.published_version_id)fail('试卷未发布',404);const v=check(await db.from('exam_versions').select('snapshot').eq('id',e.published_version_id).single());data=testerExamView({...v.snapshot,id:e.id,status:'published'});break;}
 case 'userState':admin();data=await mutate(me.id,'userState',{id:p.id,active:p.active});break;
 case 'resetPassword':{admin();if(p.id===me.id)fail('请在设置中修改自己的密码');const temp=crypto.randomUUID()+'A7';const nonce=crypto.randomUUID();check(await db.rpc('api_prepare_password_change',{p_user:p.id,p_actor:me.id,p_nonce_hash:await sha(nonce),p_force:true}));check(await db.auth.admin.updateUserById(p.id,{password:temp,app_metadata:{provisioned:'mango-v1',password_change_nonce:nonce}}));data={temporaryPassword:temp};break;}
 case 'invites':manager();data=check(await db.from('invites').select('id,label,login_id,max_uses,used,expires_at,revoked,created_at').order('created_at',{ascending:false}));break;
 case 'createInvite':{manager();const noteProblem=inviteLabelError(p.label);if(noteProblem)fail(noteProblem);const boundId=identity(p.loginId),code=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().slice(0,8);check(await db.rpc('api_create_identity_invite',{p_actor:me.id,p_login_id:boundId,p_digest:await sha(code),p_hours:Math.max(1,Math.min(8760,Math.floor(Number(p.hours)||24))),p_label:String(p.label??'').slice(0,100),p_test_only:p.testOnly===true}));data={code,login_id:boundId};break;}
 case 'revokeInvite':{manager();data=check(await db.rpc('api_revoke_identity_invite',{p_actor:me.id,p_id:p.id}));break;}
 case 'exams':{if(isTesterRole(me.role)&&(!p.mode||p.mode==='public')){
 let q=db.from('exams').select('id,owner_id,published_version_id,version:exam_versions!exams_published_version_id_fkey!inner(snapshot)').eq('status','published').is('purged_at',null);
 if(p.search)q=q.ilike('version.snapshot->>title','%'+String(p.search).replace(/[%_]/g,'')+'%');
 const testerHidden=await hiddenUsers(me.id);if(testerHidden.length)q=q.not('owner_id','in','("'+testerHidden.join('","')+'")');
 const testerRows=check(await q.order('updated_at',{ascending:false}).range(p.offset??0,(p.offset??0)+49));const testerNames=await authorNames(testerRows.map((e:any)=>e.owner_id));
 data=testerRows.map((e:any)=>({...testerExamSummary({...e.version.snapshot,id:e.id,published_version_id:e.published_version_id,status:'published'}),author:testerNames.get(e.owner_id)??''}));break;
 }
 let query=db.from('exams').select('id,owner_id,title,description,subject,tags,status,revision,time_limit,repeat_allowed,published_version_id,updated_at,review_reason');if(p.mode==='mine')query=query.eq('owner_id',me.id).neq('status','deleted');else if(p.mode==='admin'){manager();query=query.neq('status','deleted');}else if(p.mode==='trash'){admin();query=query.eq('status','deleted').is('purged_at',null);}else query=query.eq('status','published');if(p.search)query=query.ilike('title','%'+String(p.search).replace(/[%_]/g,'')+'%');
 if(!isBusinessManager(me.role)&&(!p.mode||p.mode==='public')){const hidden=await hiddenUsers(me.id);if(hidden.length)query=query.not('owner_id','in','("'+hidden.join('","')+'")');}
 const rows=check(await query.order('updated_at',{ascending:false}).range(p.offset??0,(p.offset??0)+49));const names=await authorNames(rows.map((e:any)=>e.owner_id));
 data=rows.map((e:any)=>{const row:any={...e,author:names.get(e.owner_id)??''};if(!isBusinessManager(me.role))delete row.owner_id;return row;});break;}
 case 'createExam':{if(!String(p.title??'').trim())fail('请输入试卷名称');data=check(await db.from('exams').insert({owner_id:me.id,title:String(p.title).trim().slice(0,200)}).select().single());break;}
 case 'getExam':{const e=check(await db.from('exams').select('*').eq('id',p.id).single());if(!isBusinessManager(me.role)&&!await canSee(me.id,e.owner_id))fail('试卷不存在',404);if(e.owner_id!==me.id&&!isBusinessManager(me.role))fail('无权限',403);if(e.purged_at)fail('试卷已永久移出回收站',410);if(me.role==='secondary_admin'&&e.status==='deleted')fail('无权限',403);const names=await authorNames([e.owner_id]);const examRow:any={...e,author:names.get(e.owner_id)??''};if(!isBusinessManager(me.role))delete examRow.owner_id;data=examRow;break;}
 case 'saveExam':{if(me.role==='secondary_admin'){const before=check(await db.from('exams').select('status,questions').eq('id',p.exam?.id).single());const problem=nonDestructiveExamChange(before,p.exam);if(problem)fail(problem,403);}const structureErrors=validateStructure(p.exam);if(structureErrors.length)fail(structureErrors.join('；'));if(!Array.isArray(p.exam?.questions)||p.exam.questions.length>2000)fail('题目数据无效或超过2000题');p.exam={...p.exam,questions:p.exam.questions.map(sanitizeQuestionRichText)};if(JSON.stringify(p.exam).length>1_500_000)fail('试卷过大');await validateAttachments(p.exam,me);p.exam={...p.exam,questions:bindDrawingQuestions(p.exam.questions,me.id)};data=check(await db.rpc('api_save_exam',{p_id:p.exam.id,p_actor:me.id,p_revision:p.exam.revision,p_data:p.exam}));break;}
 case 'submitReview':{const e=check(await db.from('exams').select('*').eq('id',p.id).single());if(e.owner_id!==me.id&&!isBusinessManager(me.role))fail('无权限',403);if(!['draft','returned'].includes(e.status))fail('当前状态不能提交');validatePublication(e);data=check(await db.rpc('api_submit_review',{p_id:p.id,p_actor:me.id,p_revision:p.revision}));break;}
 case 'review':{manager();const e=check(await db.from('exams').select('*').eq('id',p.id).single());if(e.purged_at)fail('已永久删除的草稿不能恢复');if(p.decision==='publish'){validatePublication(e);}data=check(await db.rpc('api_transition_exam',{p_id:p.id,p_actor:me.id,p_action:p.decision,p_reason:p.reason??'',p_revision:Number.isInteger(p.revision)?p.revision:e.revision}));break;}
 case 'deleteExam':{const e=check(await db.from('exams').select('owner_id,revision').eq('id',p.id).single());if(e.owner_id!==me.id&&!isBusinessManager(me.role))fail('无权限',403);data=await mutate(me.id,'deleteExam',{id:p.id,revision:Number.isInteger(p.revision)?p.revision:e.revision});break;}
 case 'purgeExam':{admin();if(p.confirmPermanent!==true)fail('需要永久删除确认');check(await db.rpc('api_purge_exam',{p_id:p.id,p_actor:me.id,p_title:p.confirmTitle}));scheduleStorageCleanup();data={ok:true};break;}
 case 'copyExam':data=check(await db.rpc('api_copy_exam',{p_id:p.id,p_actor:me.id}));break;
 case 'startAttempt':{const owner=check(await db.from('exams').select('owner_id').eq('id',p.id).single());if(!isBusinessManager(me.role)&&!await canSee(me.id,owner.owner_id))fail('试卷不存在',404);const a=check(await db.rpc('api_start_attempt',{p_exam:p.id,p_user:me.id}));const v=check(await db.from('exam_versions').select('*').eq('id',a.exam_version_id).single());const map=await ensureDelivery(a,v.snapshot);data={attempt:publicAttempt(a),exam:deliveredExam(v.snapshot,map,false)};if(!isBusinessManager(me.role)){delete (data as any).exam.owner_id;delete (data as any).exam.deleted_by;delete (data as any).attempt.user_id;}break;}
 case 'attempt':{const a=check(await db.from('attempts').select('*').eq('id',p.id).single());if(a.user_id!==me.id&&(!isBusinessManager(me.role)||me.role==='secondary_admin'&&!a.submitted_at))fail('无权限',403);const v=check(await db.from('exam_versions').select('*').eq('id',a.exam_version_id).single());const map=await ensureDelivery(a,v.snapshot);data={attempt:publicAttempt(a),exam:deliveredExam(v.snapshot,map,!!a.submitted_at&&(v.snapshot.reveal_answers||isBusinessManager(me.role)),{admin:!!a.submitted_at&&isBusinessManager(me.role),released:a.submitted_at?releasedDrawingReferences(v.snapshot.questions,a.grades):{}})};if(!isBusinessManager(me.role)){delete (data as any).exam.owner_id;delete (data as any).exam.deleted_by;delete (data as any).attempt.user_id;}break;}
 case 'saveAttempt':case 'submitAttempt':{const a=check(await db.from('attempts').select('*').eq('id',p.id).eq('user_id',me.id).single());const v=check(await db.from('exam_versions').select('*').eq('id',a.exam_version_id).single());let answers=p.answers;if(!answers||typeof answers!=='object'||JSON.stringify(answers).length>1_500_000)fail('答案数据无效');const answerErrors=validateAnswers(v.snapshot.questions,answers,{attemptId:a.id});if(answerErrors.length)fail(answerErrors.join('；'));const submittedFiles=v.snapshot.questions.filter((q:any)=>q.kind==='file'&&answers[q.id]).map((q:any)=>answers[q.id]);if(submittedFiles.length){const allowed=check(await db.from('files').select('id').in('id',submittedFiles).eq('owner_id',me.id).eq('purpose','submission').eq('attempt_id',a.id).eq('verified',true));if(new Set(allowed.map((f:any)=>f.id)).size!==new Set(submittedFiles).size)fail('文件提交必须使用本次答卷由本人上传的已验证文件');}if(v.snapshot.time_limit>0&&Date.now()>Date.parse(a.started_at)+v.snapshot.time_limit*1000){answers=a.answers;}const finalErrors=validateAnswers(v.snapshot.questions,answers,{attemptId:a.id});if(finalErrors.length)fail(finalErrors.join('；'));answers=bindDrawingAnswers(v.snapshot.questions,answers,a.id,me.id);const map=await ensureDelivery(a,v.snapshot);const result=gradeExam(v.snapshot.questions,canonicalAnswers(answers,map));data=publicAttempt(check(await db.rpc('api_save_attempt',{p_id:p.id,p_user:me.id,p_revision:p.revision,p_answers:answers,p_submit:action==='submitAttempt',p_result:result})));break;}
 case 'mistakeExams':data=check(await db.rpc('api_mistake_exams',{p_user:me.id}));break;
 case 'mistakes':{const rows=check(await db.rpc('api_mistake_questions',{p_user:me.id,p_exam:p.exam,p_mode:p.mode??'wrong',p_offset:p.offset??0}));const attempts=new Map();const versions=new Map();const result=[];
 for(const row of rows){let a=attempts.get(row.attempt_id);if(!a){a=check(await db.from('attempts').select('*').eq('id',row.attempt_id).eq('user_id',me.id).not('submitted_at','is',null).single());attempts.set(a.id,a);}let v=versions.get(a.exam_version_id);if(!v){v=check(await db.from('exam_versions').select('snapshot').eq('id',a.exam_version_id).single());versions.set(a.exam_version_id,v);}const map=await ensureDelivery(a,v.snapshot);const allowed=deliveredExam(v.snapshot,map,!!v.snapshot.reveal_answers,{released:releasedDrawingReferences(v.snapshot.questions,a.grades)});const question=allowed.questions.find((q:any)=>q.id===row.question_id);if(!question)continue;result.push({...row,question,answer:a.answers?.[row.question_id],comment:a.comments?.[row.question_id]??'',title:v.snapshot.title,show_explanations:!!v.snapshot.show_explanations});}
 data=result;break;}
 case 'historyQuery':{if(p.all)manager();data=check(await db.rpc('api_history_query',{p_user:me.id,p_all:!!p.all,p_version:p.version??null,p_sort:['date','score','duration'].includes(p.sort)?p.sort:'date',p_offset:Math.max(0,Number(p.offset)||0)}));break;}
 case 'history':{let q=db.from('attempts').select('id,exam_id,exam_version_id,started_at,submitted_at,duration_seconds,score,max_score,grading_status,exams(title)').not('submitted_at','is',null);if(p.all){manager();}else q=q.eq('user_id',me.id);if(p.exam_id)q=q.eq('exam_id',p.exam_id);data=check(await q.order('submitted_at',{ascending:false}).range(p.offset??0,(p.offset??0)+49));break;}
 case 'grade':{manager();const a=check(await db.from('attempts').select('*').eq('id',p.id).single());if(!a.submitted_at)fail('答卷尚未提交');const v=check(await db.from('exam_versions').select('snapshot').eq('id',a.exam_version_id).single());const review=buildManualReview(v.snapshot.questions,a.grades,p,a.comments??{});if(review.errors.length)fail(review.errors.join('；'));data=await mutate(me.id,'grade',{id:p.id,revision:Number.isInteger(p.revision)?p.revision:a.revision,grades:review.grades,score:review.score,comments:review.comments});break;}
 case 'leaderboard':{const v=check(await db.from('exam_versions').select('exam_id').eq('id',p.version).single());const e=check(await db.from('exams').select('status,owner_id').eq('id',v.exam_id).single());if(e.status!=='published'&&e.owner_id!==me.id&&!isBusinessManager(me.role))fail('无权限',403);if(!isBusinessManager(me.role)&&!await canSee(me.id,e.owner_id))fail('试卷不存在',404);const ranked=check(await db.rpc('api_leaderboard',{p_version:p.version,p_offset:p.offset??0,p_limit:50,p_viewer:isBusinessManager(me.role)?null:me.id}));const visible=ranked.filter((r:any)=>!isTesterRole(me.role)||r.user_id===me.id);const profiles=visible.length?check(await db.from('profiles').select('id,username,avatar,avatar_code,avatar_path,role').in('id',visible.map((r:any)=>r.user_id))):[];const manager=isBusinessManager(me.role);data=await Promise.all(visible.map(async(r:any)=>{const profile=profiles.find((u:any)=>u.id===r.user_id)??null;const base:any={key:(await sha('leaderboard:'+p.version+':'+r.user_id)).slice(0,16),username:r.username,score:r.score,max_score:r.max_score,duration_seconds:r.duration_seconds,rank:r.rank,is_me:r.user_id===me.id};if(manager)return {...base,user_id:r.user_id,profile};return {...base,profile:profile?{username:profile.username,avatar:profile.avatar,avatar_code:profile.avatar_code}:null};}));break;}
 case 'upload':{if(!extensions.includes(String(p.name??'').split('.').pop()?.toLowerCase()??''))fail('不支持此文件类型');const purpose=p.purpose;if(!['shared','attachment','submission','avatar','conversion'].includes(purpose))fail('用途无效');if(purpose==='shared')manager();if(!Number.isSafeInteger(p.size)||p.size<1)fail('文件大小无效或文件为空');if(purpose!=='attachment'&&p.exam_id)fail('此文件用途不能绑定试卷');if(purpose!=='submission'&&p.attempt_id)fail('此文件用途不能绑定答卷');if(purpose==='attachment'&&!p.exam_id)fail('附件需要绑定试卷');if(purpose==='submission'&&!p.attempt_id)fail('文件提交需要正式答卷');if(p.exam_id){const e=check(await db.from('exams').select('owner_id').eq('id',p.exam_id).single());if(e.owner_id!==me.id&&!isBusinessManager(me.role))fail('无权限',403);}if(p.attempt_id){const a=check(await db.from('attempts').select('user_id,submitted_at').eq('id',p.attempt_id).single());if(a.user_id!==me.id||a.submitted_at)fail('无权限',403);}const name=String(p.name).replace(/[\\/\x00-\x1f]/g,'_').slice(0,200),path=`${me.id}/${crypto.randomUUID()}/${name}`;const ticket=check(await db.storage.from('mango-private').createSignedUploadUrl(path));const row=check(await db.rpc('api_reserve_upload',{p_user:me.id,p_purpose:purpose,p_name:name,p_size:p.size,p_mime:String(p.mime),p_path:path,p_exam:p.exam_id??null,p_attempt:p.attempt_id??null}));data={file:row,...ticket};break;}
 case 'renewUpload':{const f=check(await db.from('files').select('*').eq('id',p.id).eq('owner_id',me.id).eq('verified',false).maybeSingle());if(!f||Date.parse(f.created_at)<=Date.now()-86400000)fail('上传预约已失效或无权限',404);if(f.purpose==='shared')manager();if(f.purpose==='submission'){const a=check(await db.from('attempts').select('submitted_at').eq('id',f.attempt_id).eq('user_id',me.id).single());if(a.submitted_at)fail('答卷已提交，不能继续上传',403);}data={file:f,...check(await db.storage.from('mango-private').createSignedUploadUrl(f.path))};break;}
 case 'verifyUpload':{const f=check(await db.from('files').select('*').eq('id',p.id).eq('owner_id',me.id).single());if(!f.verified&&Date.parse(f.created_at)<=Date.now()-86400000)fail('上传预约已失效',409);if(await storedSize(f.path)!==Number(f.size))fail('文件大小不匹配');const bytes=await storedHeader(f.path);const inspected=inspectFile(f.name,bytes);if(f.purpose==='avatar'&&!['image/png','image/jpeg','image/gif','image/webp'].includes(inspected.mime))fail('头像只支持PNG/JPEG/GIF/WEBP');check(await db.from('files').update({verified:true,mime:inspected.mime}).eq('id',f.id));data={ok:true,file:{...f,verified:true,mime:inspected.mime}};break;}
 case 'files':{let q=db.from('files').select('*').eq('verified',true).eq('purpose',p.purpose??'shared');if(p.purpose&&p.purpose!=='shared')q=q.eq('owner_id',me.id);if(p.search)q=q.ilike('name','%'+String(p.search).replace(/[%_]/g,'')+'%');if(p.category)q=q.eq('category',String(p.category).slice(0,100));const sort=['name','size','created_at'].includes(p.sort)?p.sort:'created_at';const offset=Math.max(0,Math.min(1000000,Math.floor(Number(p.offset)||0)));data=check(await q.order(sort,{ascending:p.ascending===true}).order('id').range(offset,offset+49));if(isTesterRole(me.role)&&(!p.purpose||p.purpose==='shared'))data=data.map(testerSharedFile);if(!isBusinessManager(me.role))data=data.map((f:any)=>{const {owner_id,...rest}=f;return rest;});break;}
 case 'testerFile':{
 if(!isTesterRole(me.role))fail('无权限',403);const f=check(await db.from('files').select('*').eq('id',p.id).eq('verified',true).maybeSingle());if(!f||!await fileAllowed(f,me))fail('无权限',403);
 const signed=check(await db.storage.from('mango-private').createSignedUrl(f.path,30));const response=await fetch(signed.signedUrl,{signal:AbortSignal.timeout(30000)});if(!response.ok)fail('文件暂时无法读取',502);
 return new Response(response.body,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':'attachment','Content-Security-Policy':"default-src 'none'; sandbox",'X-Mango-File-Mime':f.mime,'X-Mango-File-Name':encodeURIComponent(f.name)}});
 }
 case 'fileUrl':{const f=check(await db.from('files').select('*').eq('id',p.id).eq('verified',true).single());if(!await fileAllowed(f,me))fail('无权限',403);data={...check(await db.storage.from('mango-private').createSignedUrl(f.path,60,{download:p.download||f.mime==='text/html'?f.name:false})),mime:f.mime,name:f.name};break;}
 case 'updateFile':{manager();check(await db.rpc('api_update_shared_file',{p_id:p.id,p_actor:me.id,p_name:String(p.name??'').slice(0,200),p_description:String(p.description??'').slice(0,2000),p_category:String(p.category??'').slice(0,100)}));data={ok:true};break;}
 case 'replaceShared':{admin();const old=check(await db.from('files').select('*').eq('id',p.id).eq('purpose','shared').single()),next=check(await db.from('files').select('*').eq('id',p.new_id).eq('purpose','shared').eq('verified',true).single());if(old.id===next.id)fail('请选择新文件');check(await db.rpc('api_delete_file',{p_id:old.id,p_actor:me.id,p_replace:next.id}));scheduleStorageCleanup();data={ok:true};break;}
 case 'deleteFile':{const f=check(await db.from('files').select('*').eq('id',p.id).single());if(f.purpose==='shared')admin();else if(f.owner_id!==me.id)fail('无权限',403);if(f.purpose==='attachment'&&check(await db.rpc('api_attachment_referenced',{p_file:f.id})))fail('文件仍被试卷或历史版本引用，不能删除');if(f.purpose==='submission'&&f.attempt_id)fail('答卷文件需要保留，不能单独删除');if(f.purpose==='avatar'){const profiles=check(await db.from('profiles').select('id').eq('avatar_path',f.id).limit(1));if(profiles.length)fail('请先更换当前头像');}if(f.purpose==='conversion'){const jobs=check(await db.from('conversion_jobs').select('id').eq('input_file_id',f.id).limit(1));if(jobs.length)fail('请先删除相关转换记录');}check(await db.rpc('api_delete_file',{p_id:f.id,p_actor:me.id}));scheduleStorageCleanup();data={ok:true};break;}
 case 'conversionInfo':data={configured:!!await converterUrl(),formats:conversionFormats,retention_hours:24,application_upload_limit_bytes:null};break;
 case 'conversionInputs':data=check(await db.from('files').select('id,name,size,created_at').eq('owner_id',me.id).eq('purpose','conversion').eq('verified',true).order('created_at',{ascending:false}).limit(100));break;
 case 'wakeConverter':{const waiting=check(await db.from('conversion_jobs').select('id').eq('user_id',me.id).eq('status','queued').limit(1));if(waiting.length)await wakeConverter();data={ok:true};break;}
 case 'conversions':data=check(await db.from('conversion_jobs').select('*,files!input_file_id(name)').eq('user_id',me.id).order('created_at',{ascending:false}).range(Math.max(0,Math.floor(Number(p.offset)||0)),Math.max(0,Math.floor(Number(p.offset)||0))+49));break;
 case 'createConversion':{const f=check(await db.from('files').select('*').eq('id',p.file_id).eq('owner_id',me.id).eq('verified',true).eq('purpose','conversion').single());const ext=f.name.split('.').pop()?.toLowerCase();if(!conversionFormats[ext??'']?.includes(p.target))fail('该格式暂不支持此转换');const admitted=await db.rpc('api_create_conversion_job',{p_user:me.id,p_file:f.id,p_target:p.target});data=check(admitted);await wakeConverter();break;}
 case 'deleteConversion':{const job=check(await db.from('conversion_jobs').select('*').eq('id',p.id).eq('user_id',me.id).single());if(job.status==='running')fail('正在运行的转换暂不能删除');await removeConversion(job,me.id);data={ok:true};break;}
 case 'cancelConversion':{const cancelled=check(await db.from('conversion_jobs').update({status:'cancelled'}).eq('id',p.id).eq('user_id',me.id).eq('status','queued').select('id').maybeSingle());if(!cancelled)fail('任务已开始、状态已变化或无权限，请刷新后重试',409);data={ok:true};break;}
 case 'conversionDownload':{const j=check(await db.from('conversion_jobs').select('*').eq('id',p.id).eq('user_id',me.id).eq('status','completed').maybeSingle());if(!j)fail('转换记录不存在或无权限',404);if(Date.parse(j.expires_at)<Date.now())fail('文件已到期');data=check(await db.storage.from('mango-private').createSignedUrl(j.output_path,60,{download:(check(await db.from('files').select('name').eq('id',j.input_file_id).single()).name.replace(/\.[^.]+$/,'')||'converted')+'.'+(j.target==='png'?'zip':j.target)}));break;}
 case 'logs':manager();data=check(await db.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(100));break;
 case 'saveConfig':admin();if(p.key==='converter_url'){if(typeof p.value!=='string'||p.value!==''&&!/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(p.value))fail('需要Render HTTPS服务地址');}else if(p.key!=='registration_enabled'||typeof p.value!=='boolean')fail('配置无效');data=await mutate(me.id,'saveConfig',{key:p.key,value:p.value});break;
 case 'config':manager();data=publicConfiguration(check(await db.from('system_config').select('*')));break;
 default:fail('接口不存在',404);
 }
 return new Response(JSON.stringify({data,idle_expires_at:idleExpiresAt,server_time:new Date().toISOString()}),{headers});
 }catch(e){const result=publicError(e);if(loginFailureStarted!==undefined&&result.status===401)await padLoginFailure(loginFailureStarted,failureTarget);return new Response(JSON.stringify({error:result.error,code:result.code}),{status:result.status,headers:{...headers,...result.status===429?{'Retry-After':e instanceof RequestRateLimitError?retryAfterSeconds(e.seconds):'60'}:{}}});}
});
