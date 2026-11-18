-- Primary-admin-only real names. Kept outside profiles so every profile/API response
-- does not accidentally expose them to the account owner or other roles.
create table if not exists public.profile_real_names(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 real_name text not null check (char_length(real_name) between 3 and 4),
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.profile_real_names enable row level security;
revoke all on public.profile_real_names from public,anon,authenticated;
grant select,insert,update,delete on public.profile_real_names to service_role;
comment on table public.profile_real_names is 'Primary-admin-only real names; never exposed through client roles.';
notify pgrst, 'reload schema';

