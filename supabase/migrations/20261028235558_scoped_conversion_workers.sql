alter table public.profiles add column is_test_account boolean not null default false;
update public.profiles set is_test_account=true where role='visitor' and username ~ '^(qa_|ui_|offline_|privacy_|race_)';
alter table public.invites add column test_only boolean not null default false;
create table private.conversion_workers(digest text primary key check(length(digest)=64),label text not null,enabled boolean not null default true,last_seen_at timestamptz);
alter table private.conversion_workers enable row level security;
revoke all on private.conversion_workers from public,anon,authenticated;
create function public.api_worker_key_valid(p_digest text) returns boolean language plpgsql security definer set search_path='' as $$begin update private.conversion_workers set last_seen_at=now() where digest=p_digest and enabled;return found;end$$;
revoke all on function public.api_worker_key_valid(text) from public,anon,authenticated;
grant execute on function public.api_worker_key_valid(text) to service_role;
create function public.api_claim_conversion_scoped(p_test_only boolean) returns public.conversion_jobs language plpgsql set search_path='' as $$
declare j public.conversion_jobs;begin
 update public.conversion_jobs c set status='failed',error='转换运行器超时，请重试',lease_id=null,lease_until=null where c.status='running' and c.lease_until<now() and (not p_test_only or exists(select 1 from public.profiles p where p.id=c.user_id and p.is_test_account));
 select c.* into j from public.conversion_jobs c join public.profiles p on p.id=c.user_id where c.status='queued' and c.expires_at>now() and (not p_test_only or p.is_test_account) order by c.created_at for update of c skip locked limit 1;
 if j.id is null then return null;end if;
 update public.conversion_jobs set status='running',lease_id=gen_random_uuid(),lease_until=now()+interval '15 minutes',output_path=user_id::text||'/converted/'||id::text||'.'||case when target='png' then 'zip' else target end where id=j.id returning * into j;return j;
end$$;
revoke all on function public.api_claim_conversion_scoped(boolean) from public,anon,authenticated;
grant execute on function public.api_claim_conversion_scoped(boolean) to service_role;
insert into public.system_config(key,value) values('converter_url','""'::jsonb) on conflict(key) do nothing;
