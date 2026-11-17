create or replace function public.api_users_by_role(p_actor uuid,p_offset int default 0)
returns table(id uuid,username text,login_id text,active boolean,role text,created_at timestamptz,last_login_at timestamptz,password_changed_at timestamptz)
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.role in ('admin','secondary_admin') and p.active) then raise exception using errcode='42501',message='需要管理员权限';end if;
 return query select p.id,p.username,case when exists(select 1 from public.profiles actor where actor.id=p_actor and actor.role='admin') then p.login_id else null::text end,p.active,p.role,p.created_at,p.last_login_at,p.password_changed_at
 from public.profiles p
 order by case p.role when 'admin' then 0 when 'secondary_admin' then 1 when 'tester' then 2 else 3 end,lower(p.username collate "C"),p.id
 limit 50 offset greatest(0,least(p_offset,1000000));
end$$;

create or replace function public.api_create_identity_invite(p_actor uuid,p_login_id text,p_digest text,p_hours int,p_label text default '',p_test_only boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare bound text:=btrim(p_login_id); canonical text; result public.invites;
begin
 if p_label is null or length(p_label)>100 or p_label ~ '[[:cntrl:]​-‏‪-‮⁠-⁯﻿]' or length(regexp_replace(normalize(p_label,NFKC),'[^A-Za-z一-鿿㐀-䶿]','','g'))<3 then raise exception using errcode='22023',message='备注至少包含3个中文字或英文字母';end if;
 if bound is null or length(bound) not between 4 and 64 or bound !~ '^[A-Za-z0-9][A-Za-z0-9 ]*[A-Za-z0-9]$' then raise exception 'ID格式无效';end if;
 if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_hours is null or p_hours not between 1 and 8760 then raise exception '密令参数无效';end if;
 perform 1 from public.profiles where id=p_actor and role in ('admin','secondary_admin') and active for share;
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

create or replace function public.api_revoke_identity_invite(p_actor uuid,p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare bound text; result public.invites;
begin
 perform 1 from public.profiles where id=p_actor and role in ('admin','secondary_admin') and active for share;
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
notify pgrst,'reload schema';
