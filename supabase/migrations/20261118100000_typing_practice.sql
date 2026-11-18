create table if not exists public.typing_attempts(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null check(mode in ('test','inspect')),
 root_type text not null check(root_type in ('cangjie','quick')),
 time_limit_seconds int not null check(time_limit_seconds in (300,600)),
 target_text text not null,
 typed_text text not null default '',
 attempted int not null default 0,
 correct int not null default 0,
 wrong int not null default 0,
 cpm numeric(10,2) not null default 0,
 accuracy numeric(5,2) not null default 0,
 started_at timestamptz not null default clock_timestamp(),
 submitted_at timestamptz,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists typing_attempts_user on public.typing_attempts(user_id,submitted_at desc);
alter table public.typing_attempts enable row level security;
revoke all on public.typing_attempts from public,anon,authenticated;
grant all on public.typing_attempts to service_role;
notify pgrst,'reload schema';
