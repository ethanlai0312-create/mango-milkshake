-- v2026.11.18.01
-- Keep exams when an account is permanently deleted, preserve the author nickname,
-- and stop exposing other users' account UUIDs to non-manager roles.
begin;

alter table public.profiles add column if not exists purged_at timestamptz;

create or replace function public.api_users_by_role(p_actor uuid, p_offset int default 0)
returns table(id uuid, username text, login_id text, active boolean, role text, created_at timestamptz, last_login_at timestamptz, password_changed_at timestamptz)
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.role in ('admin','secondary_admin') and p.active) then raise exception using errcode='42501',message='需要管理员权限';end if;
 return query select p.id,p.username,case when exists(select 1 from public.profiles actor where actor.id=p_actor and actor.role='admin') then p.login_id else null::text end,p.active,p.role,p.created_at,p.last_login_at,p.password_changed_at
 from public.profiles p
 where p.purged_at is null
 order by case p.role when 'admin' then 0 when 'secondary_admin' then 1 when 'tester' then 2 else 3 end,lower(p.username collate "C"),p.id
 limit 50 offset greatest(0,least(p_offset,1000000));
end$$;

-- Account purge keeps the profile row as a tombstone so owned exams survive with
-- their original author nickname. Auth login is disabled by banning the identity.
create or replace function public.api_purge_account(p_actor uuid, p_target uuid, p_username text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.profiles; tombstone_login text;
begin
 perform 1 from public.profiles where id=p_actor and role='admin' and active for key share;
 if not found then raise exception '无权限';end if;
 if p_actor=p_target then raise exception '不能删除自己';end if;
 select * into target from public.profiles where id=p_target for update;
 if not found then raise exception '账号不存在或已删除';end if;
 if target.purged_at is not null then raise exception '账号已注销';end if;
 if target.role='admin' then raise exception '不能删除管理员账号';end if;
 if p_username is distinct from target.username then raise exception '账号名确认不一致';end if;

 insert into private.storage_cleanup(path) select output_path from public.conversion_jobs where user_id=p_target and output_path is not null on conflict do nothing;
 delete from public.conversion_jobs where user_id=p_target;
 insert into private.storage_cleanup(path) select path from public.files where owner_id=p_target and purpose in ('avatar','conversion','submission') on conflict do nothing;
 delete from public.files where owner_id=p_target and purpose in ('avatar','conversion','submission');
 update public.files set owner_id=p_actor where owner_id=p_target;
 delete from public.attempts where user_id=p_target;

 -- Exams are intentionally NOT reassigned or deleted: the tombstone profile keeps
 -- the owner reference and the original nickname for author display.
 update public.exams set deleted_by=null where deleted_by=p_target;
 update public.invites set created_by=null where created_by=p_target;
 update public.reviews set actor_id=null where actor_id=p_target;
 update public.audit_logs set actor_id=null where actor_id=p_target;
 delete from private.password_change_permits where user_id=p_target or actor_id=p_target;
 delete from private.registrations where user_id=p_target;

 tombstone_login := 'deleted'||replace(p_target::text,'-','');
 update public.profiles set active=false,purged_at=clock_timestamp(),login_id=tombstone_login,role='visitor',avatar_path=null,is_test_account=false,id_notice_seen=true,must_change_password=false,password_changed_at=clock_timestamp() where id=p_target;

 delete from auth.sessions where user_id=p_target;
 delete from auth.refresh_tokens where user_id=p_target::text;
 update auth.users set banned_until='infinity',updated_at=clock_timestamp() where id=p_target;

 insert into public.audit_logs(actor_id,event,entity_id,details) values(p_actor,'account.permanently_deleted',p_target::text,'{"shared_content":"retained","exams":"retained","private_data":"deleted"}'::jsonb);
 return jsonb_build_object('ok',true,'storageCleanup','queued');
end$$;

notify pgrst,'reload schema';
commit;
