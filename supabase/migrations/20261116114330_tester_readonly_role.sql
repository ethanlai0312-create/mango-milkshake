begin;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('admin','visitor','tester'));
create or replace function public.api_set_user_role(p_actor uuid,p_target uuid,p_role text,p_expected text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.profiles; desired text; expected text;
begin
 if p_role not in ('user','tester') or p_expected not in ('user','tester') or p_role is null or p_expected is null then raise exception using errcode='42501',message='无权限';end if;
 perform 1 from public.profiles where id=p_actor and role='admin' and active for share;
 if not found then raise exception using errcode='42501',message='需要管理员权限';end if;
 select * into target from public.profiles where id=p_target for update;
 if target.id is null then raise exception '账号不存在';end if;
 if target.role='admin' or p_target=p_actor then raise exception using errcode='42501',message='无权限';end if;
 desired:=case when p_role='user' then 'visitor' else 'tester' end;
 expected:=case when p_expected='user' then 'visitor' else 'tester' end;
 if target.role<>expected then raise exception using errcode='40001',message='Role changed concurrently';end if;
 if target.role<>desired then
  update public.profiles set role=desired,sessions_revoked_at=clock_timestamp() where id=p_target;
  -- Existing session checks compare session creation to this revocation epoch.
  -- Supabase owns auth.sessions; do not grant broad DELETE rights to service_role.
  insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'user_role_changed',p_target::text);
 end if;
 return jsonb_build_object('id',p_target,'role',desired,'reauthentication_required',true);
end $$;
revoke all on function public.api_set_user_role(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.api_set_user_role(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
