alter table public.profiles add column sessions_revoked_at timestamptz;
grant select(created_at) on auth.sessions to service_role;
create or replace function public.api_session_valid(p_user uuid,p_session uuid) returns boolean language sql set search_path='' as $$select exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id where s.id=p_session and s.user_id=p_user and p.active and (s.not_after is null or s.not_after>now()) and (p.sessions_revoked_at is null or s.created_at>p.sessions_revoked_at))$$;
create or replace function public.api_revoke_sessions(p_user uuid) returns void language sql set search_path='' as $$update public.profiles set sessions_revoked_at=clock_timestamp() where id=p_user$$;
-- Supabase owns auth.sessions and does not grant DELETE to project service_role.
-- An epoch check rejects all existing sessions, including later refreshes of them.
