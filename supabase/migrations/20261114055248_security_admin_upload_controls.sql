create table private.admin_step_up_use (
 session_id uuid not null references auth.sessions(id) on delete cascade,
 verified_at bigint not null,
 primary key (session_id, verified_at)
);
alter table private.admin_step_up_use enable row level security;
revoke all on private.admin_step_up_use from public, anon, authenticated;
grant insert on private.admin_step_up_use to service_role;

create function public.api_consume_admin_step_up(p_user uuid, p_session uuid, p_verified_at bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if p_verified_at < extract(epoch from clock_timestamp()) - 300
 or p_verified_at > extract(epoch from clock_timestamp()) + 5
 or public.api_session_idle_deadline(p_user, p_session, false) is null
 or not exists(select 1 from public.profiles where id=p_user and role='admin' and active)
 then return false; end if;
 insert into private.admin_step_up_use values(p_session,p_verified_at) on conflict do nothing;
 get diagnostics changed = row_count;
 return changed=1;
end;
$$;
revoke all on function public.api_consume_admin_step_up(uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.api_consume_admin_step_up(uuid,uuid,bigint) to service_role;

create function public.api_reserve_upload(
 p_user uuid,p_purpose text,p_name text,p_size bigint,p_mime text,p_path text,p_exam uuid,p_attempt uuid
) returns public.files language plpgsql security invoker set search_path='' as $$
declare
 account_role text;
 reserved bigint;
 pending bigint;
 result public.files;
begin
 select role into account_role from public.profiles where id=p_user and active for update;
 if not found or (p_purpose='shared' and account_role<>'admin') then raise exception '没有上传权限'; end if;
 select coalesce(sum(size),0), count(*) filter(where not verified)
 into reserved,pending
 from public.files
 where owner_id=p_user and (verified or created_at>clock_timestamp()-interval '24 hours');
 if p_size<1 or reserved+p_size > (case when account_role='admin' then 20 else 5 end)::bigint*1073741824 then
  raise exception '上传超出账号容量，请删除不需要的文件后重试';
 end if;
 if pending>=2 then raise exception '最多同时上传两个文件，请完成或取消已有上传'; end if;
 insert into public.files(owner_id,purpose,name,size,mime,path,exam_id,attempt_id)
 values(p_user,p_purpose,p_name,p_size,p_mime,p_path,p_exam,p_attempt)
 returning * into result;
 return result;
end;
$$;
revoke all on function public.api_reserve_upload(uuid,text,text,bigint,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.api_reserve_upload(uuid,text,text,bigint,text,text,uuid,uuid) to service_role;

create function public.api_expire_uploads() returns void
language sql security invoker set search_path='' as $$
 with candidates as (
  select id from public.files
  where not verified and created_at<clock_timestamp()-interval '26 hours'
  order by created_at limit 50 for update skip locked
 ), removed as (
  delete from public.files f using candidates c where f.id=c.id and not f.verified returning f.path
 )
 insert into private.storage_cleanup(path) select path from removed on conflict do nothing
$$;
revoke all on function public.api_expire_uploads() from public,anon,authenticated;
grant execute on function public.api_expire_uploads() to service_role;
