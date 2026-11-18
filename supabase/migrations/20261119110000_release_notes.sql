create table if not exists public.release_notes(
 id uuid primary key default gen_random_uuid(),
 version text not null,
 released_on date not null default current_date,
 sort integer not null default 0,
 body text not null,
 roles text[] not null default array['admin','secondary_admin','tester','visitor']::text[],
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists release_notes_roles on public.release_notes using gin(roles);
create index if not exists release_notes_sort on public.release_notes(sort,released_on desc);
alter table public.release_notes enable row level security;
revoke all on public.release_notes from public,anon,authenticated;
grant all on public.release_notes to service_role;
notify pgrst,'reload schema';
