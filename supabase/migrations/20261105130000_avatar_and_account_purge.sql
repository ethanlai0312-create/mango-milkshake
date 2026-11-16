begin;
-- Appearance saves must never overwrite a concurrently changed avatar.
create or replace function public.api_update_settings(p_user uuid,p_settings jsonb,p_avatar jsonb,p_photo text) returns public.profiles
language plpgsql security invoker set search_path='' as $$
declare result public.profiles;
begin
 update public.profiles set settings=p_settings where id=p_user and active returning * into result;
 if result.id is null then raise exception '账号不可用';end if;
 return result;
end$$;
create function public.api_update_avatar(p_user uuid,p_avatar jsonb,p_photo uuid) returns public.profiles
language plpgsql security invoker set search_path='' as $$
declare result public.profiles;
begin
 perform 1 from public.profiles where id=p_user and active for update;
 if not found then raise exception '账号不可用';end if;
 if p_photo is not null then
  perform 1 from public.files where id=p_photo and owner_id=p_user and purpose='avatar' and verified for key share;
  if not found then raise exception '头像必须是本人已验证的图片';end if;
 end if;
 update public.profiles set avatar=coalesce(p_avatar,avatar),avatar_path=p_photo::text where id=p_user returning * into result;
 return result;
end$$;
revoke all on function public.api_update_avatar(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.api_update_avatar(uuid,jsonb,uuid) to service_role;

-- Atomic removal includes authentication and sessions; shared learning records survive.
create function public.api_purge_account(p_actor uuid,p_target uuid,p_username text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.profiles;
begin
 perform 1 from public.profiles where id=p_actor and role='admin' and active for key share;
 if not found then raise exception '无权限';end if;
 if p_actor=p_target then raise exception '不能删除自己';end if;
 select * into target from public.profiles where id=p_target for update;
 if not found then raise exception '账号不存在或已删除';end if;
 if target.role='admin' or target.username='admin' then raise exception '不能删除管理员账号';end if;
 if p_username is distinct from target.username then raise exception '账号名确认不一致';end if;
 insert into private.storage_cleanup(path) select output_path from public.conversion_jobs where user_id=p_target and output_path is not null on conflict do nothing;
 delete from public.conversion_jobs where user_id=p_target;
 insert into private.storage_cleanup(path) select path from public.files where owner_id=p_target and purpose in ('avatar','conversion','submission') on conflict do nothing;
 delete from public.files where owner_id=p_target and purpose in ('avatar','conversion','submission');
 update public.files set owner_id=p_actor where owner_id=p_target;
 delete from public.attempts where user_id=p_target;
 update public.exams set owner_id=p_actor where owner_id=p_target;
 update public.exams set deleted_by=null where deleted_by=p_target;
 update public.invites set created_by=null where created_by=p_target;
 update public.reviews set actor_id=null where actor_id=p_target;
 update public.audit_logs set actor_id=null where actor_id=p_target;
 delete from private.password_change_permits where user_id=p_target or actor_id=p_target;
 delete from private.registrations where user_id=p_target;
 delete from public.profiles where id=p_target;
 delete from auth.users where id=p_target;
 insert into public.audit_logs(actor_id,event,entity_id,details) values(p_actor,'account.permanently_deleted',p_target::text,'{"shared_content":"retained","private_data":"deleted"}'::jsonb);
 return jsonb_build_object('ok',true,'storageCleanup','queued');
end$$;
revoke all on function public.api_purge_account(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.api_purge_account(uuid,uuid,text) to service_role;
commit;
