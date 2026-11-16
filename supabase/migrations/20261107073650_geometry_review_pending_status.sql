-- Each audited mutation and its audit record commit or roll back together.
create or replace function public.api_audited_mutation(p_actor uuid,p_action text,p_data jsonb)
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
revoke all on function public.api_audited_mutation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.api_audited_mutation(uuid,text,jsonb) to service_role;

