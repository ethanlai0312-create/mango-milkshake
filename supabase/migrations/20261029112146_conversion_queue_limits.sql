-- Serialize admissions so concurrent requests cannot overfill the free worker.
create function public.api_create_conversion_job(p_user uuid,p_file uuid,p_target text)
returns public.conversion_jobs language plpgsql security definer set search_path='' as $$
declare job public.conversion_jobs;
begin
 perform pg_catalog.pg_advisory_xact_lock(6831,202610);
 perform 1 from public.files where id=p_file and owner_id=p_user and verified and purpose='conversion' for key share;
 if not found then raise exception '转换文件不存在或无权限';end if;
 if (select count(*) from public.conversion_jobs where status in ('queued','running') and expires_at>now())>=200 then
  raise exception '转换服务队列已满，请稍后重试';end if;
 if (select count(*) from public.conversion_jobs where user_id=p_user and status in ('queued','running') and expires_at>now())>=8 then
  raise exception '转换配额已满：每个账号最多8个待处理任务';end if;
 -- This counter survives deletion of job history, preventing quota bypass.
 if not public.api_rate_limit('conversion_jobs:'||p_user::text,50,86400) then
  raise exception '转换配额已满：每个24小时窗口最多50个任务';end if;
 insert into public.conversion_jobs(user_id,input_file_id,target) values(p_user,p_file,p_target) returning * into job;
 return job;
end$$;
revoke all on function public.api_create_conversion_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.api_create_conversion_job(uuid,uuid,text) to service_role;
