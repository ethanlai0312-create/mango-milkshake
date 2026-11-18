create or replace function public.api_disable_inactive_accounts(p_days int default 14,p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz; candidates jsonb;
begin
 if p_days is null or p_days<1 or p_days>3650 then raise exception '天数无效';end if;
 cutoff:=clock_timestamp()-make_interval(days=>p_days);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'username',username,'last_seen',coalesce(last_login_at,created_at),'role',role) order by coalesce(last_login_at,created_at),id),'[]'::jsonb)
 into candidates
 from public.profiles
 where active
  and role not in ('admin','secondary_admin','tester')
  and coalesce(is_test_account,false)=false
  and coalesce(last_login_at,created_at)<cutoff;
 if p_dry_run then
  return jsonb_build_object('dry_run',true,'days',p_days,'cutoff',cutoff,'count',jsonb_array_length(candidates),'accounts',candidates);
 end if;
 if jsonb_array_length(candidates)=0 then
  return jsonb_build_object('dry_run',false,'days',p_days,'cutoff',cutoff,'count',0,'accounts','[]'::jsonb);
 end if;
 with updated as (
  update public.profiles set active=false,sessions_revoked_at=clock_timestamp()
  where active
   and role not in ('admin','secondary_admin','tester')
   and coalesce(is_test_account,false)=false
   and coalesce(last_login_at,created_at)<cutoff
  returning id,username,coalesce(last_login_at,created_at) last_seen
 ), logged as (
  insert into public.audit_logs(actor_id,event,entity_id,details)
  select null,'account.auto_disabled_inactive',id::text,jsonb_build_object('days',p_days,'last_seen',last_seen)
  from updated returning 1
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'username',username,'last_seen',last_seen) order by last_seen,id),'[]'::jsonb) into candidates from updated;
 return jsonb_build_object('dry_run',false,'days',p_days,'cutoff',cutoff,'count',jsonb_array_length(candidates),'accounts',candidates);
end$$;
revoke all on function public.api_disable_inactive_accounts(int,boolean) from public,anon,authenticated;
grant execute on function public.api_disable_inactive_accounts(int,boolean) to service_role;
notify pgrst,'reload schema';
