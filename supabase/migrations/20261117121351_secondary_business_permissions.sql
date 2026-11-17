-- Secondary admin receives explicitly limited business capabilities. Primary-only account/security functions remain unchanged.

create or replace function public.api_save_exam(p_id uuid,p_actor uuid,p_revision int,p_data jsonb) returns public.exams language plpgsql security invoker set search_path='' as $$
declare e public.exams;fid uuid;
begin
 select * into e from public.exams where id=p_id for update;
 if e.id is null then raise exception '试卷不存在';end if;
 if not exists(select 1 from public.profiles where id=p_actor and active and (id=e.owner_id or role in ('admin','secondary_admin'))) then raise exception '无权限';end if;

 if exists(select 1 from public.profiles where id=p_actor and role='secondary_admin') then
  if e.status='published' then raise exception '副管理员不能修改已发布试卷，请复制为新草稿';end if;
  if exists(
   select 1 from jsonb_array_elements(e.questions) old
   left join lateral (select value item from jsonb_array_elements(p_data->'questions') where value->>'id'=old->>'id') next on true
   where next.item is null or next.item->>'kind' is distinct from old->>'kind'
    or jsonb_array_length(coalesce(next.item->'options','[]'))<jsonb_array_length(coalesce(old->'options','[]'))
    or exists(select 1 from jsonb_array_elements_text(coalesce(old->'attachments','[]')) f where not coalesce(next.item->'attachments','[]') ? f.value)
  ) then raise exception '副管理员不能删除题目、选项或附件，或更换已有题型';end if;
 end if;
 if p_revision is distinct from e.revision then raise exception 'CONFLICT:试卷有新版本，请保留本地内容后重新载入';end if;
 if e.status='deleted' or e.purged_at is not null then raise exception '试卷在回收站';end if;
 for fid in select distinct attachment.value::uuid from jsonb_array_elements(p_data->'questions') question cross join lateral jsonb_array_elements_text(coalesce(question->'attachments','[]'::jsonb)) attachment(value) order by attachment.value::uuid loop
  perform 1 from public.files where id=fid and purpose='attachment' and verified for key share;
  if not found then raise exception '附件已删除或尚未验证，请重新上传';end if;
 end loop;
 update public.exams set title=p_data->>'title',description=coalesce(p_data->>'description',''),subject=coalesce(p_data->>'subject',''),tags=coalesce(p_data->'tags','[]'),questions=p_data->'questions',time_limit=(p_data->>'time_limit')::int,repeat_allowed=(p_data->>'repeat_allowed')::boolean,reveal_answers=(p_data->>'reveal_answers')::boolean,show_explanations=(p_data->>'show_explanations')::boolean,status='draft',revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into e;
 return e;
end$$;

create or replace function public.api_submit_review(p_id uuid,p_actor uuid,p_revision int) returns public.exams language plpgsql security invoker set search_path='' as $$
declare e public.exams;
begin
 select * into e from public.exams where id=p_id for update;
 if e.id is null or not exists(select 1 from public.profiles where id=p_actor and active and (id=e.owner_id or role in ('admin','secondary_admin'))) then raise exception '无权限';end if;
 if e.revision<>p_revision then raise exception 'CONFLICT:试卷已修改，请重新载入';end if;
 if e.status not in ('draft','returned') or e.purged_at is not null then raise exception '当前状态不能提交';end if;
 update public.exams set status='pending',revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into e;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'review_requested',p_id::text);
 return e;
end$$;

create or replace function public.api_transition_exam(p_id uuid,p_actor uuid,p_action text,p_reason text,p_revision int) returns public.exams language plpgsql security invoker set search_path='' as $$
declare e public.exams;
begin
 if exists(select 1 from public.profiles where id=p_actor and role='secondary_admin') and p_action not in ('publish','return') then raise exception '副管理员不能撤销发布或操作回收站';end if;

 if not exists(select 1 from public.profiles where id=p_actor and role in ('admin','secondary_admin') and active) then raise exception '无权限';end if;
 select * into e from public.exams where id=p_id for update;
 if e.id is null or e.purged_at is not null then raise exception '试卷不存在或已永久清除';end if;
 if p_revision is distinct from e.revision then raise exception 'CONFLICT:审核期间试卷已修改，请重新检查';end if;
 if (p_action in ('publish','return') and e.status<>'pending') or (p_action='unpublish' and e.status<>'published') or (p_action='restore' and e.status<>'deleted') or p_action not in ('publish','return','unpublish','restore') then raise exception '当前试卷状态不允许此操作';end if;
 perform public.api_review_exam(p_id,p_actor,p_action,p_reason);
 update public.exams set revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into e;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'exam_'||p_action,p_id::text);
 return e;
end$$;

create or replace function public.api_review_exam(p_id uuid,p_actor uuid,p_action text,p_reason text) returns public.exams language plpgsql security invoker set search_path='' as $$declare e public.exams;v uuid;n int;begin
 if exists(select 1 from public.profiles where id=p_actor and role='secondary_admin') and p_action not in ('publish','return') then raise exception '副管理员不能撤销发布或操作回收站';end if;
 if not exists(select 1 from public.profiles where id=p_actor and role in ('admin','secondary_admin') and active) then raise exception '无权限';end if;select * into e from public.exams where id=p_id for update;if e.id is null then raise exception '不存在';end if;if p_action='publish' then if e.status<>'pending' then raise exception '必须先提交审核';end if;select coalesce(max(number),0)+1 into n from public.exam_versions where exam_id=p_id;insert into public.exam_versions(exam_id,number,snapshot,max_score) values(p_id,n,to_jsonb(e),(select sum((x->>'points')::numeric) from jsonb_array_elements(e.questions)x)) returning id into v;update public.exams set status='published',published_version_id=v where id=p_id;elsif p_action='return' then if length(trim(p_reason))=0 then raise exception '请填写退回原因';end if;update public.exams set status='returned',review_reason=p_reason where id=p_id;elsif p_action='unpublish' then update public.exams set status='unpublished' where id=p_id;elsif p_action='restore' then update public.exams set status='draft',deleted_at=null,deleted_by=null where id=p_id and status='deleted';else raise exception '无效操作';end if;insert into public.reviews(exam_id,actor_id,action,reason)values(p_id,p_actor,p_action,p_reason);select * into e from public.exams where id=p_id;return e;end$$;

create or replace function public.api_history_query(p_user uuid,p_all boolean default false,p_version uuid default null,p_sort text default 'date',p_offset int default 0) returns jsonb language sql security invoker set search_path='' as $$
with base as (
 select a.id,a.user_id,a.exam_id,a.exam_version_id,a.score,a.max_score,a.duration_seconds,a.submitted_at,a.grading_status,p.username,v.snapshot->>'title' title,v.number version_number,
 row_number()over(partition by a.user_id,a.exam_id order by a.started_at,a.id) attempt_number
 from public.attempts a join public.profiles p on p.id=a.user_id join public.exam_versions v on v.id=a.exam_version_id
 where (not p_all and a.user_id=p_user) or (p_all and exists(select 1 from public.profiles actor where actor.id=p_user and actor.role in ('admin','secondary_admin') and actor.active))
), filtered as(select * from base where submitted_at is not null and (p_version is null or exam_version_id=p_version)), ranked as(
 select * from filtered order by case when p_sort='score' then score end desc nulls last,case when p_sort='duration' then duration_seconds end asc nulls last,submitted_at desc,id limit 50 offset greatest(0,p_offset)
), filters as(select distinct exam_version_id id,title,version_number number from base where submitted_at is not null)
select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r)) from ranked r),'[]'::jsonb),'filters',coalesce((select jsonb_agg(to_jsonb(f) order by f.title,f.number desc) from filters f),'[]'::jsonb),'stats',(select jsonb_build_object('count',count(*),'best_score',max(score)filter(where grading_status='final'),'best_percent',round(max(score/nullif(max_score,0)*100)filter(where grading_status='final'),2),'fastest_seconds',min(duration_seconds),'total_seconds',coalesce(sum(duration_seconds),0))from filtered))
$$;

create or replace function public.api_copy_exam(p_id uuid,p_actor uuid) returns public.exams language plpgsql security invoker set search_path='' as $$
declare e public.exams;result public.exams;fid uuid;
begin
 select * into e from public.exams where id=p_id for share;
 if e.id is null or e.purged_at is not null or (e.status='deleted' and exists(select 1 from public.profiles where id=p_actor and role='secondary_admin')) then raise exception '试卷不存在或已永久清除';end if;
 if not exists(select 1 from public.profiles where id=p_actor and active and (id=e.owner_id or role in ('admin','secondary_admin'))) then raise exception '无权限';end if;
 for fid in select distinct attachment.value::uuid from jsonb_array_elements(e.questions) question cross join lateral jsonb_array_elements_text(coalesce(question->'attachments','[]'::jsonb)) attachment(value) order by attachment.value::uuid loop
  perform 1 from public.files where id=fid and purpose='attachment' and verified for key share;
  if not found then raise exception '原试卷附件已删除，请检查后重新复制';end if;
 end loop;
 insert into public.exams(owner_id,title,description,subject,tags,questions,time_limit,repeat_allowed,reveal_answers,show_explanations)
 values(p_actor,left(e.title,195)||'（副本）',e.description,e.subject,e.tags,e.questions,e.time_limit,e.repeat_allowed,e.reveal_answers,e.show_explanations) returning * into result;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'exam_copied',result.id::text);
 return result;
end$$;

create or replace function public.api_update_shared_file(p_id uuid,p_actor uuid,p_name text,p_description text,p_category text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role in ('admin','secondary_admin') and active) then raise exception '无权限';end if;
 if length(trim(p_name))=0 then raise exception '文件名称不能为空';end if;
 update public.files set name=left(p_name,200),description=left(p_description,2000),category=left(p_category,100) where id=p_id and purpose='shared';
 if not found then raise exception '共享文件不存在或已删除';end if;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'shared_file_updated',p_id::text);
end$$;

create or replace function public.api_reserve_upload(
 p_user uuid,p_purpose text,p_name text,p_size bigint,p_mime text,p_path text,p_exam uuid,p_attempt uuid
) returns public.files language plpgsql security invoker set search_path='' as $$
declare
 account_role text;
 reserved bigint;
 pending bigint;
 result public.files;
begin
 select role into account_role from public.profiles where id=p_user and active for update;
 if not found or (p_purpose='shared' and account_role not in ('admin','secondary_admin')) then raise exception '没有上传权限'; end if;
 select coalesce(sum(size),0), count(*) filter(where not verified)
 into reserved,pending
 from public.files
 where owner_id=p_user and (verified or created_at>clock_timestamp()-interval '24 hours');
 if p_size<1 or reserved+p_size > (case when account_role='admin' then 20 else 5 end)::bigint*1073741824 then
  raise exception '上传超出账号容量，请删除不需要的文件后重试';
 end if;
 if pending>=2 then raise exception '最多同时上传两个文件，请完成或取消已有上传'; end if;
 insert into public.files(owner_id,purpose,name,size,mime,path,exam_id,attempt_id)
 values(p_user,p_purpose,p_name,p_size,p_mime,p_path,p_exam,p_attempt)
 returning * into result;
 return result;
end;
$$;

create or replace function public.api_audited_mutation(p_actor uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.profiles; e public.exams; a public.attempts; inv public.invites; result jsonb; entity text; event_name text;
begin
 select * into actor from public.profiles where id=p_actor and active;
 if actor.id is null then raise exception '账号不可用';end if;
 if actor.role='secondary_admin' and p_action<>'grade' then raise exception '副管理员不能删除、停用或管理账号和配置';end if;
 if p_action<>'deleteExam' and not (actor.role='admin' or actor.role='secondary_admin' and p_action='grade') then raise exception '需要管理员权限';end if;
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
  update public.attempts set grades=p_data->'grades',score=(p_data->>'score')::numeric,grading_status=case when exists(select 1 from jsonb_each(p_data->'grades') as grade where grade.value->>'status'='pending') then 'pending' else 'final' end,comments=coalesce(p_data->'comments','{}'),revision=revision+1 where id=a.id returning to_jsonb(attempts.*) into result;
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

create or replace function public.api_delete_file(p_id uuid,p_actor uuid,p_replace uuid default null) returns void language plpgsql security invoker set search_path='' as $$
declare f public.files;replacement public.files;actor public.profiles;
begin
 perform pg_catalog.pg_advisory_xact_lock(6831,202610);
 select * into actor from public.profiles where id=p_actor and active;
 if actor.role='secondary_admin' then raise exception '副管理员不能删除或替换文件';end if;
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

create or replace function public.api_remove_conversion(p_id uuid,p_user uuid default null) returns void language plpgsql security invoker set search_path='' as $$
declare job public.conversion_jobs;input public.files;
begin
 if exists(select 1 from public.profiles where id=p_user and role='secondary_admin') then raise exception '副管理员不能删除转换记录';end if;
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

notify pgrst,'reload schema';
