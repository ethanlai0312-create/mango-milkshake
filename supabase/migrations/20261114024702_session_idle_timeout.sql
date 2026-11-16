create table public.session_idle_activity (
 session_id uuid primary key references auth.sessions(id) on delete cascade,
 last_activity_at timestamptz not null
);
alter table public.session_idle_activity enable row level security;
revoke all on public.session_idle_activity from public, anon, authenticated;
grant select, insert, update on public.session_idle_activity to service_role;

-- Existing sessions get one transition window. New sessions start at creation.
insert into public.session_idle_activity (session_id, last_activity_at)
select s.id, statement_timestamp()
from auth.sessions s
where public.api_session_valid(s.user_id, s.id);

create function public.api_session_idle_deadline(
 p_user uuid, p_session uuid, p_activity boolean
) returns timestamptz language plpgsql set search_path = '' as $$
declare
 started timestamptz;
 last_active timestamptz;
begin
 if not public.api_session_valid(p_user, p_session) then
  return null;
 end if;

 select s.created_at into started from auth.sessions s
 where s.id = p_session and s.user_id = p_user;
 if not found then return null; end if;

 if p_activity then
  -- Lock only when recording activity. Recheck the clock after acquiring it.
  insert into public.session_idle_activity (session_id, last_activity_at)
  values (p_session, started)
  on conflict (session_id) do nothing;
  select a.last_activity_at into last_active
  from public.session_idle_activity a
  where a.session_id = p_session for update;
 else
  select a.last_activity_at into last_active
  from public.session_idle_activity a where a.session_id = p_session;
  last_active := coalesce(last_active, started);
 end if;

 if last_active is null or last_active + interval '1 hour' <= clock_timestamp() then
  return null;
 end if;

 if p_activity then
  if not public.api_session_valid(p_user, p_session) then return null; end if;
  update public.session_idle_activity
  set last_activity_at = greatest(last_active, clock_timestamp())
  where session_id = p_session
  returning last_activity_at into last_active;
 end if;

 return last_active + interval '1 hour';
end;
$$;
revoke all on function public.api_session_idle_deadline(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.api_session_idle_deadline(uuid, uuid, boolean) to service_role;
