-- Each audited mutation and its audit record commit or roll back together.
create function public.api_audited_mutation(p_actor uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.profiles; e public.exams; a public.attempts; inv public.invites; result jsonb; entity text; event_name text;
begin
 select * into actor from public.profiles where id=p_actor and active;
 if actor.id is null then raise exception '账号不可用';end if;
 if p_action<>'deleteExam' and actor.role<>'admin' then raise exception '需要管理员权限';end if;
 entity:=p_data->>'id';
 case p_action
 when 'deleteExam' then
  select * into e from public.exams where id=entity::uuid for update;
  if e.id is null or (e.owner_id<>p_actor and actor.role<>'admin') then raise exception '无权限';end if;
  if e.purged_at is not null then raise exception '试卷已永久移出回收站';end if;
  if e.status='deleted' then return to_jsonb(e);end if;
  if (p_data->>'revision')::int is distinct from e.revision then raise exception 'CONFLICT:试卷已修改，请刷新后重试';end if;
  update public.exams set status='deleted',deleted_at=clock_timestamp(),deleted_by=p_actor,revision=revision+1,updated_at=clock_timestamp() where id=e.id returning to_jsonb(exams.*) into result;
  event_name:='exam_soft_deleted';
 when 'userState' then
  if entity::uuid=p_actor then raise exception '不能停用自己';end if;
  perform 1 from public.profiles where id=entity::uuid for update;
  if not found then raise exception '账号不存在';end if;
  update public.profiles set active=(p_data->>'active')::boolean,
   sessions_revoked_at=case when not (p_data->>'active')::boolean then clock_timestamp() else sessions_revoked_at end
   where id=entity::uuid returning jsonb_build_object('id',id,'username',username,'active',active) into result;
  event_name:='user_state';
 when 'createInvite' then
  insert into public.invites(digest,max_uses,expires_at,label,created_by,test_only)
   values(p_data->>'digest',greatest(1,least(10000,(p_data->>'maxUses')::int)),clock_timestamp()+make_interval(hours=>greatest(1,least(8760,(p_data->>'hours')::int))),left(coalesce(p_data->>'label',''),100),p_actor,coalesce((p_data->>'testOnly')::boolean,false)) returning * into inv;
  entity:=inv.id::text; result:=jsonb_build_object('id',inv.id);event_name:='invite_created';
 when 'revokeInvite' then
  update public.invites set revoked=true where id=entity::uuid returning jsonb_build_object('id',id) into result;
  if result is null then raise exception '密令不存在';end if;event_name:='invite_revoked';
 when 'grade' then
  select * into a from public.attempts where id=entity::uuid for update;
  if a.id is null or a.submitted_at is null then raise exception '答卷不存在或尚未提交';end if;
  if (p_data->>'revision')::int is distinct from a.revision then raise exception 'CONFLICT:成绩已有更新，请重新载入';end if;
  if jsonb_typeof(p_data->'grades')<>'object' or (p_data->>'score')::numeric<0 or (p_data->>'score')::numeric>a.max_score then raise exception '批改分数无效';end if;
  update public.attempts set grades=p_data->'grades',score=(p_data->>'score')::numeric,grading_status='final',comments=coalesce(p_data->'comments','{}'),revision=revision+1 where id=a.id returning to_jsonb(attempts.*) into result;
  event_name:='attempt_graded';
 when 'saveConfig' then
  entity:=p_data->>'key';
  if entity='registration_enabled' then
   if jsonb_typeof(p_data->'value')<>'boolean' then raise exception '配置无效';end if;
  elsif entity='converter_url' then
   if jsonb_typeof(p_data->'value')<>'string' then raise exception '配置无效';end if;
  else raise exception '配置无效';end if;
  insert into public.system_config(key,value) values(entity,p_data->'value') on conflict(key) do update set value=excluded.value;
  result:=jsonb_build_object('ok',true);event_name:='config_updated';
 else raise exception '无效写入操作';
 end case;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,event_name,entity);
 return result;
end$$;
revoke all on function public.api_audited_mutation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.api_audited_mutation(uuid,text,jsonb) to service_role;

create or replace function public.api_submit_review(p_id uuid,p_actor uuid,p_revision int) returns public.exams language plpgsql security invoker set search_path='' as $$
declare e public.exams;
begin
 select * into e from public.exams where id=p_id for update;
 if e.id is null or not exists(select 1 from public.profiles where id=p_actor and active and (id=e.owner_id or role='admin')) then raise exception '无权限';end if;
 if e.revision<>p_revision then raise exception 'CONFLICT:试卷已修改，请重新载入';end if;
 if e.status not in ('draft','returned') or e.purged_at is not null then raise exception '当前状态不能提交';end if;
 update public.exams set status='pending',revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into e;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'review_requested',p_id::text);
 return e;
end$$;
create or replace function public.api_transition_exam(p_id uuid,p_actor uuid,p_action text,p_reason text,p_revision int) returns public.exams language plpgsql security invoker set search_path='' as $$
declare e public.exams;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and active) then raise exception '无权限';end if;
 select * into e from public.exams where id=p_id for update;
 if e.id is null or e.purged_at is not null then raise exception '试卷不存在或已永久清除';end if;
 if p_revision is distinct from e.revision then raise exception 'CONFLICT:审核期间试卷已修改，请重新检查';end if;
 if (p_action in ('publish','return') and e.status<>'pending') or (p_action='unpublish' and e.status<>'published') or (p_action='restore' and e.status<>'deleted') or p_action not in ('publish','return','unpublish','restore') then raise exception '当前试卷状态不允许此操作';end if;
 perform public.api_review_exam(p_id,p_actor,p_action,p_reason);
 update public.exams set revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into e;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'exam_'||p_action,p_id::text);
 return e;
end$$;

-- The Auth update transaction also commits profile state, revocation and audit.
alter table private.password_change_permits add column actor_id uuid references public.profiles(id),add column force_change boolean not null default false;
create function public.api_prepare_password_change(p_user uuid,p_actor uuid,p_nonce_hash text,p_force boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and active and (id=p_user or role='admin')) or not exists(select 1 from public.profiles where id=p_user and active) then raise exception '无权限或账号不可用';end if;
 if p_force and p_user=p_actor then raise exception '请在设置中修改自己的密码';end if;
 if p_force is distinct from (p_user<>p_actor) then raise exception '密码修改方式无效';end if;
 insert into private.password_change_permits(user_id,nonce_hash,expires_at,actor_id,force_change) values(p_user,p_nonce_hash,clock_timestamp()+interval '1 minute',p_actor,p_force)
 on conflict(user_id) do update set nonce_hash=excluded.nonce_hash,expires_at=excluded.expires_at,actor_id=excluded.actor_id,force_change=excluded.force_change;
end$$;

-- Storage is external to PostgreSQL. Commit metadata and a durable cleanup task
-- together, then retry physical deletion without reporting a committed action as failed.
create table private.storage_cleanup(path text primary key,created_at timestamptz not null default now());
alter table private.storage_cleanup enable row level security;
revoke all on private.storage_cleanup from public,anon,authenticated;
grant select,insert,delete on private.storage_cleanup to service_role;
create function public.api_storage_cleanup(p_finished text[] default null) returns table(path text) language plpgsql security invoker set search_path='' as $$
begin
 if p_finished is not null then delete from private.storage_cleanup c where c.path=any(p_finished);end if;
 return query select c.path from private.storage_cleanup c order by c.created_at,c.path limit 20;
end$$;
revoke all on function public.api_storage_cleanup(text[]) from public,anon,authenticated;
grant execute on function public.api_storage_cleanup(text[]) to service_role;

create function public.api_remove_conversion(p_id uuid,p_user uuid default null) returns void language plpgsql security invoker set search_path='' as $$
declare job public.conversion_jobs;input public.files;
begin
 perform pg_catalog.pg_advisory_xact_lock(6831,202610);
 select * into job from public.conversion_jobs where id=p_id for update;
 if job.id is null then return;end if;
 if p_user is not null and job.user_id<>p_user then raise exception '无权限';end if;
 if p_user is null and job.expires_at>clock_timestamp() then raise exception '转换文件尚未到期';end if;
 if job.status='running' and job.lease_until>clock_timestamp() then raise exception '正在运行的转换暂不能删除';end if;
 select * into input from public.files where id=job.input_file_id for update;
 delete from public.conversion_jobs where id=job.id;
 if job.output_path is not null then insert into private.storage_cleanup(path) values(job.output_path) on conflict do nothing;end if;
 if not exists(select 1 from public.conversion_jobs where input_file_id=job.input_file_id) and input.id is not null then
  delete from public.files where id=input.id;
  insert into private.storage_cleanup(path) values(input.path) on conflict do nothing;
 end if;
end$$;
revoke all on function public.api_remove_conversion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.api_remove_conversion(uuid,uuid) to service_role;

create function public.api_delete_file(p_id uuid,p_actor uuid,p_replace uuid default null) returns void language plpgsql security invoker set search_path='' as $$
declare f public.files;replacement public.files;actor public.profiles;
begin
 perform pg_catalog.pg_advisory_xact_lock(6831,202610);
 select * into actor from public.profiles where id=p_actor and active;
 if actor.id is null then raise exception '账号不可用';end if;
 perform 1 from public.files where id=p_id or id=p_replace order by id for update;
 select * into f from public.files where id=p_id;
 if f.id is null then return;end if;
 if (f.purpose='shared' and actor.role<>'admin') or (f.purpose<>'shared' and f.owner_id<>p_actor) then raise exception '无权限';end if;
 if f.purpose='attachment' and public.api_attachment_referenced(f.id) then raise exception '文件仍被试卷或历史版本引用，不能删除';end if;
 if f.purpose='submission' and f.attempt_id is not null then raise exception '答卷文件需要保留，不能单独删除';end if;
 if f.purpose='avatar' and exists(select 1 from public.profiles where avatar_path=f.id::text) then raise exception '请先更换当前头像';end if;
 if f.purpose='conversion' and exists(select 1 from public.conversion_jobs where input_file_id=f.id) then raise exception '请先删除相关转换记录';end if;
 if p_replace is not null then
  select * into replacement from public.files where id=p_replace and purpose='shared' and verified;
  if f.purpose<>'shared' or actor.role<>'admin' or replacement.id is null or f.id=p_replace then raise exception '替换文件无效';end if;
  update public.files set description=f.description,category=f.category where id=p_replace;
 end if;
 delete from public.files where id=f.id;
 insert into private.storage_cleanup(path) values(f.path) on conflict do nothing;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,case when p_replace is null then 'file_deleted' else 'shared_file_replaced' end,f.id::text);
end$$;
revoke all on function public.api_delete_file(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.api_delete_file(uuid,uuid,uuid) to service_role;

create function public.api_update_settings(p_user uuid,p_settings jsonb,p_avatar jsonb,p_photo text) returns public.profiles language plpgsql security invoker set search_path='' as $$
declare profile public.profiles;
begin
 if p_photo is not null then
  perform 1 from public.files where id=p_photo::uuid and owner_id=p_user and purpose='avatar' and verified for key share;
  if not found then raise exception '头像必须是本人已验证的图片';end if;
 end if;
 update public.profiles set settings=p_settings,avatar=p_avatar,avatar_path=p_photo where id=p_user and active returning * into profile;
 if profile.id is null then raise exception '账号不可用';end if;
 return profile;
end$$;
revoke all on function public.api_update_settings(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.api_update_settings(uuid,jsonb,jsonb,text) to service_role;

create or replace function public.api_save_exam(p_id uuid,p_actor uuid,p_revision int,p_data jsonb) returns public.exams language plpgsql security invoker set search_path='' as $$
declare e public.exams;fid uuid;
begin
 select * into e from public.exams where id=p_id for update;
 if e.id is null then raise exception '试卷不存在';end if;
 if not exists(select 1 from public.profiles where id=p_actor and active and (id=e.owner_id or role='admin')) then raise exception '无权限';end if;
 if p_revision is distinct from e.revision then raise exception 'CONFLICT:试卷有新版本，请保留本地内容后重新载入';end if;
 if e.status='deleted' or e.purged_at is not null then raise exception '试卷在回收站';end if;
 for fid in select distinct attachment.value::uuid from jsonb_array_elements(p_data->'questions') question cross join lateral jsonb_array_elements_text(coalesce(question->'attachments','[]'::jsonb)) attachment(value) order by attachment.value::uuid loop
  perform 1 from public.files where id=fid and purpose='attachment' and verified for key share;
  if not found then raise exception '附件已删除或尚未验证，请重新上传';end if;
 end loop;
 update public.exams set title=p_data->>'title',description=coalesce(p_data->>'description',''),subject=coalesce(p_data->>'subject',''),tags=coalesce(p_data->'tags','[]'),questions=p_data->'questions',time_limit=(p_data->>'time_limit')::int,repeat_allowed=(p_data->>'repeat_allowed')::boolean,reveal_answers=(p_data->>'reveal_answers')::boolean,show_explanations=(p_data->>'show_explanations')::boolean,status='draft',revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into e;
 return e;
end$$;
revoke all on function public.api_prepare_password_change(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.api_prepare_password_change(uuid,uuid,text,boolean) to service_role;
create or replace function private.guard_password_change() returns trigger language plpgsql security definer set search_path='' as $$
declare nonce text;expected text;permit private.password_change_permits;
begin
 select raw_app_meta_data->>'password_change_nonce' into nonce from auth.users where id=new.id;
 if nonce is null then raise exception '请通过平台安全密码接口修改密码';end if;
 expected=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(nonce,'UTF8')),'hex');
 delete from private.password_change_permits where user_id=new.id and nonce_hash=expected and expires_at>clock_timestamp() returning * into permit;
 if permit.user_id is null or permit.actor_id is null then raise exception '请通过平台安全密码接口修改密码';end if;
 update public.profiles set must_change_password=permit.force_change,password_changed_at=clock_timestamp(),sessions_revoked_at=clock_timestamp() where id=new.id;
 insert into public.audit_logs(actor_id,event,entity_id) values(permit.actor_id,case when permit.force_change then 'password_reset' else 'password_changed' end,new.id::text);
 return new;
end$$;

create function public.api_register_profile(p_user uuid,p_username text) returns void language plpgsql security invoker set search_path='' as $$
declare reg private.registrations;
begin
 select * into reg from private.registrations where username=p_username and user_id is null for update;
 if reg.username is null then raise exception '注册预约不存在或已完成';end if;
 insert into public.profiles(id,username,must_change_password,is_test_account) select p_user,p_username,false,test_only from public.invites where id=reg.invite_id;
 update private.registrations set user_id=p_user where username=p_username;
end$$;
revoke all on function public.api_register_profile(uuid,text) from public,anon,authenticated;
grant execute on function public.api_register_profile(uuid,text) to service_role;

create function public.api_finish_conversion(p_id uuid,p_lease uuid,p_success boolean,p_error text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.conversion_jobs set status=case when p_success then 'completed' else 'failed' end,error=case when p_success then null else left(p_error,500) end,lease_until=null
 where id=p_id and lease_id=p_lease and status='running' and lease_until>clock_timestamp();
 return found;
end$$;
revoke all on function public.api_finish_conversion(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.api_finish_conversion(uuid,uuid,boolean,text) to service_role;

-- Return an existing active conversion before consuming another quota slot.
create or replace function public.api_create_conversion_job(p_user uuid,p_file uuid,p_target text) returns public.conversion_jobs language plpgsql security definer set search_path='' as $$
declare job public.conversion_jobs;
begin
 perform pg_catalog.pg_advisory_xact_lock(6831,202610);
 perform 1 from public.files where id=p_file and owner_id=p_user and verified and purpose='conversion' for key share;
 if not found then raise exception '转换文件不存在或无权限';end if;
 select * into job from public.conversion_jobs where user_id=p_user and input_file_id=p_file and target=p_target and status in ('queued','running') and expires_at>clock_timestamp() order by created_at,id limit 1;
 if job.id is not null then return job;end if;
 if (select count(*) from public.conversion_jobs where status in ('queued','running') and expires_at>now())>=200 then raise exception '转换服务队列已满，请稍后重试';end if;
 if (select count(*) from public.conversion_jobs where user_id=p_user and status in ('queued','running') and expires_at>now())>=8 then raise exception '转换配额已满：每个账号最多8个待处理任务';end if;
 if not public.api_rate_limit('conversion_jobs:'||p_user::text,50,86400) then raise exception '转换配额已满：每个24小时窗口最多50个任务';end if;
 insert into public.conversion_jobs(user_id,input_file_id,target) values(p_user,p_file,p_target) returning * into job;
 return job;
end$$;
