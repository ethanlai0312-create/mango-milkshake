-- v2026.11.18.04
-- Account purge keeps learning history: attempts must survive so admin/history
-- records remain, matching the requirement to retain usage records and exams.
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

 -- Usage records (attempts/history) are intentionally retained.
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

 insert into public.audit_logs(actor_id,event,entity_id,details) values(p_actor,'account.permanently_deleted',p_target::text,'{"shared_content":"retained","exams":"retained","attempts":"retained","private_data":"deleted"}'::jsonb);
 return jsonb_build_object('ok',true,'storageCleanup','queued');
end$$;
notify pgrst,'reload schema';
