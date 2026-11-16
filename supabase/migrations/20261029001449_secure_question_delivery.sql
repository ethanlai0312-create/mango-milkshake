alter table public.attempts add column delivery_map jsonb not null default '{"legacy":true}'::jsonb;
alter table public.attempts alter column delivery_map set default '{}'::jsonb;
create function public.api_set_delivery_map(p_attempt uuid,p_user uuid,p_map jsonb) returns jsonb language plpgsql set search_path='' as $$
declare a public.attempts;begin
 select * into a from public.attempts where id=p_attempt and user_id=p_user for update;
 if a.id is null then raise exception '答卷不存在';end if;
 if a.delivery_map='{}'::jsonb then update public.attempts set delivery_map=p_map where id=p_attempt;return p_map;end if;
 return a.delivery_map;
end$$;
revoke all on function public.api_set_delivery_map(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.api_set_delivery_map(uuid,uuid,jsonb) to service_role;
