-- Fix visibility helpers to run as the trusted owner so they can read the
-- private visibility tables; the API calls them with the service role.
create or replace function public.api_visibility_visible(p_viewer uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_viewer=p_owner or (
  not exists(select 1 from private.visibility_block_all where user_id=p_viewer or user_id=p_owner)
  and not exists(select 1 from private.visibility_pair where (user_id=p_viewer and blocked_user_id=p_owner) or (user_id=p_owner and blocked_user_id=p_viewer))
 )
$$;
revoke all on function public.api_visibility_visible(uuid,uuid) from public, anon, authenticated;
grant execute on function public.api_visibility_visible(uuid,uuid) to service_role;

create or replace function public.api_visibility_hidden(p_viewer uuid)
returns setof uuid language sql stable security definer set search_path='' as $$
 select p.id from public.profiles p where p.id<>p_viewer and not public.api_visibility_visible(p_viewer,p.id)
$$;
revoke all on function public.api_visibility_hidden(uuid) from public, anon, authenticated;
grant execute on function public.api_visibility_hidden(uuid) to service_role;

create or replace function public.api_user_visibility(p_actor uuid, p_target uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
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

grant select,insert,update,delete on private.visibility_block_all, private.visibility_pair to service_role;
notify pgrst,'reload schema';
