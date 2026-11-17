-- Functionality-only migration. Real account-to-ID mappings belong in a private,
-- operator transaction alongside this file; never place those mappings in Git.
alter table public.profiles add column login_id text;
update public.profiles set login_id='legacy'||replace(id::text,'-','');
alter table public.profiles alter column login_id set default ('legacy'||replace(gen_random_uuid()::text,'-',''));
alter table public.profiles alter column login_id set not null;
alter table public.profiles add column login_id_key text generated always as (lower(login_id collate "C")) stored;
alter table public.profiles add constraint profiles_login_id_valid check(length(login_id) between 4 and 64 and login_id ~ '^[A-Za-z0-9][A-Za-z0-9 ]*[A-Za-z0-9]$');
alter table public.profiles add constraint profiles_login_id_key_unique unique(login_id_key);
alter table public.profiles drop constraint profiles_username_key;

create function private.guard_login_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.login_id is distinct from old.login_id then
  -- A one-time operator backfill is permitted only inside its explicit transaction.
  -- Browser/API service roles cannot change this identifier, even with a custom GUC.
  if current_user not in ('postgres','supabase_admin') or current_setting('mango.identity_migration',true) is distinct from 'on' then
   raise exception using errcode='42501',message='登录ID不能修改';
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('mango-login-id:'||lower(new.login_id collate "C"),0));
 return new;
end$$;
create trigger immutable_login_identity before insert or update of login_id on public.profiles for each row execute function private.guard_login_identity();
revoke all on function private.guard_login_identity() from public,anon,authenticated;

alter table public.invites add column login_id text;
alter table public.invites add column login_id_key text generated always as (lower(login_id collate "C")) stored;
-- Old unbound secrets cannot register an arbitrary new login identity.
update public.invites set revoked=true where not revoked;
alter table public.invites add constraint invites_bound_login_id_valid check(login_id is null or (length(login_id) between 4 and 64 and login_id ~ '^[A-Za-z0-9][A-Za-z0-9 ]*[A-Za-z0-9]$' and max_uses=1));
create index invites_login_id_key_idx on public.invites(login_id_key);
create table private.identity_registrations(
 login_id_key text primary key,
 reservation uuid not null unique default gen_random_uuid(),
 invite_id uuid not null unique references public.invites(id),
 user_id uuid unique references public.profiles(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp()
);
alter table private.identity_registrations enable row level security;
revoke all on private.identity_registrations from public,anon,authenticated;
grant all on private.identity_registrations to service_role;

create function private.guard_invite_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.login_id is distinct from old.login_id then raise exception '密令绑定ID不能修改';end if;
 if new.login_id is null then
  if tg_op='INSERT' or not new.revoked then raise exception '生成密令前必须填写全新ID';end if;
  return new;
 end if;
 if not new.revoked and new.expires_at>clock_timestamp() and new.used<new.max_uses then
  perform pg_advisory_xact_lock(hashtextextended('mango-login-id:'||lower(new.login_id collate "C"),0));
  if exists(select 1 from public.profiles where login_id_key=lower(new.login_id collate "C")) then raise exception 'ID已注册，不能重复使用';end if;
  if exists(select 1 from public.invites where id<>new.id and login_id_key=lower(new.login_id collate "C") and not revoked and expires_at>clock_timestamp() and used<max_uses) then raise exception 'ID已有有效密令';end if;
 end if;
 return new;
end$$;
create trigger require_bound_invite_identity before insert or update on public.invites for each row execute function private.guard_invite_identity();
revoke all on function private.guard_invite_identity() from public,anon,authenticated;

create function public.api_create_identity_invite(p_actor uuid,p_login_id text,p_digest text,p_hours int,p_label text default '',p_test_only boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare bound text:=btrim(p_login_id); canonical text; result public.invites;
begin
 if bound is null or length(bound) not between 4 and 64 or bound !~ '^[A-Za-z0-9][A-Za-z0-9 ]*[A-Za-z0-9]$' then raise exception 'ID格式无效';end if;
 if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_hours is null or p_hours not between 1 and 8760 then raise exception '密令参数无效';end if;
 perform 1 from public.profiles where id=p_actor and role='admin' and active for share;
 if not found then raise exception using errcode='42501',message='需要管理员权限';end if;
 canonical:=lower(bound collate "C");
 perform pg_advisory_xact_lock(hashtextextended('mango-login-id:'||canonical,0));
 if exists(select 1 from public.profiles where login_id_key=canonical) then raise exception 'ID已注册，不能重复使用';end if;
 -- A revoked/expired reservation can never complete; release only its exact token.
 delete from private.identity_registrations r using public.invites i where r.invite_id=i.id and r.login_id_key=canonical and r.user_id is null and (i.revoked or i.expires_at<=clock_timestamp());
 if exists(select 1 from private.identity_registrations where login_id_key=canonical and user_id is null) or exists(select 1 from public.invites where login_id_key=canonical and not revoked and expires_at>clock_timestamp() and used<max_uses) then raise exception 'ID已有有效密令';end if;
 insert into public.invites(digest,login_id,max_uses,expires_at,label,created_by,test_only)
 values(p_digest,bound,1,clock_timestamp()+make_interval(hours=>p_hours),left(coalesce(p_label,''),100),p_actor,p_test_only) returning * into result;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'invite_created',result.id::text);
 return jsonb_build_object('id',result.id,'login_id',bound);
end$$;

create function public.api_revoke_identity_invite(p_actor uuid,p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare bound text; result public.invites;
begin
 perform 1 from public.profiles where id=p_actor and role='admin' and active for share;
 if not found then raise exception using errcode='42501',message='需要管理员权限';end if;
 select login_id_key into bound from public.invites where id=p_id;
 if not found then raise exception '密令不存在';end if;
 if bound is not null then perform pg_advisory_xact_lock(hashtextextended('mango-login-id:'||bound,0));end if;
 select * into result from public.invites where id=p_id for update;
 update public.invites set revoked=true where id=p_id;
 delete from private.identity_registrations where invite_id=p_id and user_id is null;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'invite_revoked',p_id::text);
 return jsonb_build_object('id',p_id);
end$$;

create function public.api_reserve_identity_registration(p_login_id text,p_digest text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare canonical text:=lower(btrim(p_login_id) collate "C"); inv public.invites; token uuid;
begin
 if p_login_id is null or length(btrim(p_login_id)) not between 4 and 64 or btrim(p_login_id) !~ '^[A-Za-z0-9][A-Za-z0-9 ]*[A-Za-z0-9]$' then raise exception 'ID格式无效';end if;
 perform pg_advisory_xact_lock(hashtextextended('mango-login-id:'||canonical,0));
 select * into inv from public.invites where digest=p_digest for update;
 if inv.id is null or inv.login_id is null or inv.login_id_key<>canonical or inv.revoked or inv.expires_at<=clock_timestamp() or inv.used>=inv.max_uses then raise exception '密令无效、过期、已用尽或与ID不匹配';end if;
 if exists(select 1 from public.profiles where login_id_key=canonical) then raise exception 'ID已注册，不能重复使用';end if;
 if exists(select 1 from private.identity_registrations where login_id_key=canonical) then raise exception 'ID正在注册，请稍后重试';end if;
 insert into private.identity_registrations(login_id_key,invite_id) values(canonical,inv.id) returning reservation into token;
 update public.invites set used=used+1 where id=inv.id;
 return token;
end$$;

create function public.api_complete_identity_registration(p_user uuid,p_reservation uuid,p_nickname text)
returns void language plpgsql security invoker set search_path='' as $$
declare reg private.identity_registrations; inv public.invites; canonical text; display_name text:=btrim(p_nickname);
begin
 if display_name is null or length(display_name) not between 1 and 32 or display_name ~ '[[:cntrl:]]' then raise exception '昵称格式无效';end if;
 select login_id_key into canonical from private.identity_registrations where reservation=p_reservation;
 if canonical is null then raise exception '注册预约不存在或已完成';end if;
 perform pg_advisory_xact_lock(hashtextextended('mango-login-id:'||canonical,0));
 select * into reg from private.identity_registrations where reservation=p_reservation for update;
 if reg.reservation is null or reg.user_id is not null then raise exception '注册预约不存在或已完成';end if;
 select * into inv from public.invites where id=reg.invite_id for update;
 if inv.id is null or inv.revoked or inv.expires_at<=clock_timestamp() or inv.login_id_key<>canonical then raise exception '密令无效、过期、已用尽或与ID不匹配';end if;
 if exists(select 1 from public.profiles where login_id_key=canonical) then raise exception 'ID已注册，不能重复使用';end if;
 insert into public.profiles(id,username,login_id,must_change_password,is_test_account) values(p_user,display_name,inv.login_id,false,inv.test_only);
 update private.identity_registrations set user_id=p_user where reservation=p_reservation;
end$$;

create function public.api_release_identity_registration(p_reservation uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare canonical text; inv uuid;
begin
 select login_id_key into canonical from private.identity_registrations where reservation=p_reservation and user_id is null;
 if canonical is null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('mango-login-id:'||canonical,0));
 delete from private.identity_registrations where reservation=p_reservation and user_id is null returning invite_id into inv;
 if inv is not null then update public.invites set used=greatest(0,used-1) where id=inv;end if;
end$$;

create function public.api_update_identity_settings(p_user uuid,p_settings jsonb,p_nickname text)
returns public.profiles language plpgsql security invoker set search_path='' as $$
declare result public.profiles; display_name text:=btrim(p_nickname);
begin
 if display_name is null or length(display_name) not between 1 and 32 or display_name ~ '[[:cntrl:]]' then raise exception '昵称格式无效';end if;
 update public.profiles set username=display_name,settings=p_settings where id=p_user and active returning * into result;
 if result.id is null then raise exception '账号不可用';end if;
 return result;
end$$;

-- Close the legacy nickname-based registration functions. No fallback alias remains.
revoke execute on function public.api_reserve_registration(text,text),public.api_release_registration(text),public.api_complete_registration(text,uuid),public.api_register_profile(uuid,text) from service_role;
revoke all on function public.api_create_identity_invite(uuid,text,text,int,text,boolean),public.api_revoke_identity_invite(uuid,uuid),public.api_reserve_identity_registration(text,text),public.api_complete_identity_registration(uuid,uuid,text),public.api_release_identity_registration(uuid),public.api_update_identity_settings(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.api_create_identity_invite(uuid,text,text,int,text,boolean),public.api_revoke_identity_invite(uuid,uuid),public.api_reserve_identity_registration(text,text),public.api_complete_identity_registration(uuid,uuid,text),public.api_release_identity_registration(uuid),public.api_update_identity_settings(uuid,jsonb,text) to service_role;

drop function public.api_leaderboard(uuid,int,int);
create function public.api_leaderboard(p_version uuid,p_limit int default 50,p_offset int default 0)
returns table(user_id uuid,username text,score numeric,max_score numeric,duration_seconds int,rank bigint)
language sql security invoker set search_path='' as $$
 with best as(select distinct on (a.user_id) a.user_id,a.score,a.max_score,a.duration_seconds,a.submitted_at,a.id from public.attempts a join public.profiles p on p.id=a.user_id where a.exam_version_id=p_version and a.grading_status='final' and p.active order by a.user_id,a.score desc,a.duration_seconds,a.submitted_at,a.id),
 ranked as(select b.user_id,p.username,b.score,b.max_score,b.duration_seconds,dense_rank()over(order by b.score desc,b.duration_seconds)rank,b.submitted_at,b.id from best b join public.profiles p on p.id=b.user_id)
 select r.user_id,r.username,r.score,r.max_score,r.duration_seconds,r.rank from ranked r order by r.score desc,r.duration_seconds,r.submitted_at,r.id limit least(p_limit,100) offset greatest(0,p_offset)
$$;
revoke all on function public.api_leaderboard(uuid,int,int) from public,anon,authenticated;
grant execute on function public.api_leaderboard(uuid,int,int) to service_role;
-- Mutable public names are never an authorization condition.
create or replace function public.api_purge_account(p_actor uuid,p_target uuid,p_username text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.profiles;
begin
 perform 1 from public.profiles where id=p_actor and role='admin' and active for key share;
 if not found then raise exception '无权限';end if;
 if p_actor=p_target then raise exception '不能删除自己';end if;
 select * into target from public.profiles where id=p_target for update;
 if not found then raise exception '账号不存在或已删除';end if;
 if target.role='admin' then raise exception '不能删除管理员账号';end if;
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
notify pgrst,'reload schema';
