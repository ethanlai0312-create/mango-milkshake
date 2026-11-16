begin;
create table private.account_presence (
 user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 tab_id uuid not null,
 sequence bigint not null check(sequence between 0 and 9007199254740991),
 connected boolean not null,
 last_seen_at timestamptz not null default clock_timestamp(),
 primary key(user_id,session_id,tab_id)
);
alter table private.account_presence enable row level security;
revoke all on private.account_presence from public,anon,authenticated;
grant select,insert,update,delete on private.account_presence to service_role;
create index account_presence_last_seen on private.account_presence(last_seen_at);

create function public.api_presence_touch(p_user uuid,p_session uuid,p_tab uuid,p_sequence bigint,p_online boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not public.api_session_valid(p_user,p_session) then raise exception '会话已失效'; end if;
 insert into private.account_presence(user_id,session_id,tab_id,sequence,connected,last_seen_at)
 values(p_user,p_session,p_tab,p_sequence,p_online,clock_timestamp())
 on conflict(user_id,session_id,tab_id) do update
 set sequence=excluded.sequence,connected=excluded.connected,last_seen_at=excluded.last_seen_at
 where excluded.sequence>account_presence.sequence;
 delete from private.account_presence where user_id=p_user and last_seen_at<now()-interval '1 day';
end;
$$;

create function public.api_account_presence(p_users uuid[])
returns table(user_id uuid,is_online boolean,last_seen_at timestamptz)
language sql security invoker set search_path='' as $$
 select p.id,
 coalesce(bool_or(t.connected and t.last_seen_at>now()-interval '15 seconds'
  and p.active and s.id is not null and (s.not_after is null or s.not_after>now())
  and (p.sessions_revoked_at is null or s.created_at>p.sessions_revoked_at)),false),
 max(t.last_seen_at)
 from public.profiles p
 left join private.account_presence t on t.user_id=p.id
 left join auth.sessions s on s.id=t.session_id and s.user_id=p.id
 where p.id=any(p_users) group by p.id;
$$;
revoke all on function public.api_presence_touch(uuid,uuid,uuid,bigint,boolean),public.api_account_presence(uuid[]) from public,anon,authenticated;
grant execute on function public.api_presence_touch(uuid,uuid,uuid,bigint,boolean),public.api_account_presence(uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
