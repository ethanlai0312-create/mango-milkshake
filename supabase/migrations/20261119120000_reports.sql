create table if not exists public.report_threads(
 id uuid primary key default gen_random_uuid(),
 submitter_id uuid not null references public.profiles(id) on delete cascade,
 level1 text not null default '',
 level2 text not null default '',
 submitted_at timestamptz,
 admin_read_at timestamptz,
 admin_replied_at timestamptz,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists report_threads_submitter on public.report_threads(submitter_id,submitted_at desc);
create index if not exists report_threads_time on public.report_threads(submitted_at desc);
create table if not exists public.report_messages(
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references public.report_threads(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 body text not null default '',
 attachments uuid[] not null default '{}'::uuid[],
 is_admin boolean not null default false,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists report_messages_thread on public.report_messages(thread_id,created_at);
alter table public.files add column if not exists report_id uuid references public.report_threads(id);
alter table public.files drop constraint if exists files_purpose_check;
alter table public.files add constraint files_purpose_check check(purpose in ('attachment','submission','shared','avatar','conversion','report'));

create or replace function public.api_reserve_report_upload(p_user uuid,p_report uuid,p_name text,p_size bigint,p_mime text,p_path text)
returns public.files language plpgsql security invoker set search_path='' as $$
declare account_role text; reserved bigint; pending bigint; result public.files; report_owner uuid;
begin
 select role into account_role from public.profiles where id=p_user and active for update;
 if not found then raise exception '账号不可用';end if;
 select submitter_id into report_owner from public.report_threads where id=p_report;
 if report_owner is null then raise exception '报告不存在';end if;
 if account_role<>'admin' and report_owner<>p_user then raise exception '无权限';end if;
 select coalesce(sum(size),0),count(*) filter(where not verified) into reserved,pending from public.files where owner_id=p_user and (verified or created_at>clock_timestamp()-interval '24 hours');
 if p_size<1 or reserved+p_size>(case when account_role='admin' then 20 else 5 end)::bigint*1073741824 then raise exception '上传超出账号容量，请删除不需要的文件后重试';end if;
 if pending>=2 then raise exception '最多同时上传两个文件，请完成或取消已有上传';end if;
 insert into public.files(owner_id,purpose,name,size,mime,path,report_id) values(p_user,'report',p_name,p_size,p_mime,p_path,p_report) returning * into result;
 return result;
end$$;
grant execute on function public.api_reserve_report_upload(uuid,uuid,text,bigint,text,text) to service_role;

alter table public.report_threads enable row level security;
alter table public.report_messages enable row level security;
revoke all on public.report_threads from public,anon,authenticated;
revoke all on public.report_messages from public,anon,authenticated;
grant all on public.report_threads to service_role;
grant all on public.report_messages to service_role;
notify pgrst,'reload schema';
