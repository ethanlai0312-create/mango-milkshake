-- v2026.11.18.02
-- Per-account visibility: an administrator can make selected accounts mutually
-- invisible (leaderboard, published exams and related lookups), or hide one
-- account from every other user. Managers keep full visibility for moderation.
begin;

create table if not exists private.visibility_block_all (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 created_by uuid,
 created_at timestamptz not null default clock_timestamp()
);
alter table private.visibility_block_all enable row level security;
revoke all on private.visibility_block_all from public, anon, authenticated;

create table if not exists private.visibility_pair (
 user_id uuid not null references public.profiles(id) on delete cascade,
 blocked_user_id uuid not null references public.profiles(id) on delete cascade,
 created_by uuid,
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id, blocked_user_id),
 check(user_id<>blocked_user_id)
);
alter table private.visibility_pair enable row level security;
revoke all on private.visibility_pair from public, anon, authenticated;

create or replace function public.api_visibility_visible(p_viewer uuid, p_owner uuid)
returns boolean language sql stable set search_path='' as $$
 select p_viewer=p_owner or (
  not exists(select 1 from private.visibility_block_all where user_id=p_viewer or user_id=p_owner)
  and not exists(select 1 from private.visibility_pair where (user_id=p_viewer and blocked_user_id=p_owner) or (user_id=p_owner and blocked_user_id=p_viewer))
 )
$$;
revoke all on function public.api_visibility_visible(uuid,uuid) from public, anon, authenticated;
grant execute on function public.api_visibility_visible(uuid,uuid) to service_role;

create or replace function public.api_visibility_hidden(p_viewer uuid)
returns setof uuid language sql stable set search_path='' as $$
 select p.id from public.profiles p where p.id<>p_viewer and not public.api_visibility_visible(p_viewer,p.id)
$$;
revoke all on function public.api_visibility_hidden(uuid) from public, anon, authenticated;
grant execute on function public.api_visibility_hidden(uuid) to service_role;

create or replace function public.api_user_visibility(p_actor uuid, p_target uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.profiles; blocked uuid[]; all_users boolean;
begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.role in ('admin','secondary_admin') and p.active) then raise exception using errcode='42501',message='需要管理员权限';end if;
 select * into target from public.profiles where id=p_target and purged_at is null;
 if not found then raise exception '账号不存在';end if;
 select coalesce(array_agg(blocked_user_id order by blocked_user_id),'{}') into blocked from private.visibility_pair where user_id=p_target;
 select exists(select 1 from private.visibility_block_all where user_id=p_target) into all_users;
 return jsonb_build_object('all',all_users,'blocked',to_jsonb(blocked));
end$$;
revoke all on function public.api_user_visibility(uuid,uuid) from public, anon, authenticated;
grant execute on function public.api_user_visibility(uuid,uuid) to service_role;

create or replace function public.api_set_user_visibility(p_actor uuid, p_target uuid, p_blocked uuid[], p_all boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.profiles; item uuid; saved int:=0;
begin
 perform 1 from public.profiles where id=p_actor and role='admin' and active for key share;
 if not found then raise exception '无权限';end if;
 select * into target from public.profiles where id=p_target for update;
 if not found or target.purged_at is not null then raise exception '账号不存在';end if;
 if p_target=p_actor then raise exception '不能修改自己的可见范围';end if;
 delete from private.visibility_pair where user_id=p_target or blocked_user_id=p_target;
 delete from private.visibility_block_all where user_id=p_target;
 if coalesce(p_all,false) then
  insert into private.visibility_block_all(user_id,created_by) values(p_target,p_actor);
  saved:=-1;
 else
  for item in select distinct value from unnest(coalesce(p_blocked,'{}'::uuid[])) as value loop
   if item=p_target then continue; end if;
   if not exists(select 1 from public.profiles where id=item and purged_at is null) then raise exception '被屏蔽账号不存在';end if;
   insert into private.visibility_pair(user_id,blocked_user_id,created_by) values(p_target,item,p_actor) on conflict do nothing;
   saved:=saved+1;
  end loop;
 end if;
 insert into public.audit_logs(actor_id,event,entity_id,details) values(p_actor,'visibility_changed',p_target::text,jsonb_build_object('all',coalesce(p_all,false),'blocked',saved));
 return jsonb_build_object('ok',true,'all',coalesce(p_all,false),'blocked',greatest(saved,0));
end$$;
revoke all on function public.api_set_user_visibility(uuid,uuid,uuid[],boolean) from public, anon, authenticated;
grant execute on function public.api_set_user_visibility(uuid,uuid,uuid[],boolean) to service_role;

-- Leaderboard can now hide accounts that are mutually invisible to the viewer.
drop function public.api_leaderboard(uuid,int,int);
create function public.api_leaderboard(p_version uuid,p_limit int default 50,p_offset int default 0,p_viewer uuid default null)
returns table(user_id uuid,username text,score numeric,max_score numeric,duration_seconds int,rank bigint)
language sql security invoker set search_path='' as $$
 with best as(select distinct on (a.user_id) a.user_id,a.score,a.max_score,a.duration_seconds,a.submitted_at,a.id from public.attempts a join public.profiles p on p.id=a.user_id where a.exam_version_id=p_version and a.grading_status='final' and p.active and (p_viewer is null or public.api_visibility_visible(p_viewer,a.user_id)) order by a.user_id,a.score desc,a.duration_seconds,a.submitted_at,a.id),
 ranked as(select b.user_id,p.username,b.score,b.max_score,b.duration_seconds,dense_rank()over(order by b.score desc,b.duration_seconds)rank,b.submitted_at,b.id from best b join public.profiles p on p.id=b.user_id)
 select r.user_id,r.username,r.score,r.max_score,r.duration_seconds,r.rank from ranked r order by r.score desc,r.duration_seconds,r.submitted_at,r.id limit least(p_limit,100) offset greatest(0,p_offset)
$$;
revoke all on function public.api_leaderboard(uuid,int,int,uuid) from public, anon, authenticated;
grant execute on function public.api_leaderboard(uuid,int,int,uuid) to service_role;

notify pgrst,'reload schema';
commit;
