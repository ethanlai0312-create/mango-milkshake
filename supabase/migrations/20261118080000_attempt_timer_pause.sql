alter table public.attempts add column if not exists active_seconds numeric not null default 0;
alter table public.attempts add column if not exists resumed_at timestamptz;

-- Preserve prior progress for attempts created before active-time tracking.
update public.attempts set
 active_seconds=case when duration_seconds is not null then duration_seconds else greatest(0,floor(extract(epoch from coalesce(submitted_at,clock_timestamp())-started_at))) end,
 resumed_at=case when submitted_at is null then clock_timestamp() else null end
where active_seconds=0;

create or replace function public.api_start_attempt(p_exam uuid,p_user uuid) returns public.attempts
language plpgsql security invoker set search_path='' as $$
declare e public.exams;a public.attempts;v public.exam_versions;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_exam::text,0));
 select * into e from public.exams where id=p_exam and status='published';
 if e.id is null then raise exception '试卷未发布';end if;
 select * into a from public.attempts where user_id=p_user and exam_version_id=e.published_version_id and submitted_at is null and redo_of_attempt_id is null;
 if a.id is not null then
  if a.resumed_at is null then update public.attempts set resumed_at=clock_timestamp() where id=a.id returning * into a;end if;
  return a;
 end if;
 if not e.repeat_allowed and exists(select 1 from public.attempts where user_id=p_user and exam_version_id=e.published_version_id and redo_of_attempt_id is null) then raise exception '本试卷不允许重复答题';end if;
 select * into v from public.exam_versions where id=e.published_version_id;
 insert into public.attempts(user_id,exam_id,exam_version_id,max_score,active_seconds,resumed_at)values(p_user,p_exam,v.id,v.max_score,0,clock_timestamp())returning * into a;
 return a;
end$$;

create or replace function public.api_resume_attempt(p_id uuid,p_user uuid) returns public.attempts
language plpgsql security invoker set search_path='' as $$
declare a public.attempts;
begin
 select * into a from public.attempts where id=p_id and user_id=p_user for update;
 if a.id is null then raise exception '答卷不存在';end if;
 if a.submitted_at is not null then return a;end if;
 if a.resumed_at is null then update public.attempts set resumed_at=clock_timestamp() where id=p_id returning * into a;end if;
 return a;
end$$;

create or replace function public.api_pause_attempt(p_id uuid,p_user uuid,p_revision int,p_answers jsonb) returns public.attempts
language plpgsql security invoker set search_path='' as $$
declare a public.attempts;elapsed numeric;
begin
 select * into a from public.attempts where id=p_id and user_id=p_user for update;
 if a.id is null then raise exception '答卷不存在';end if;
 if a.submitted_at is not null then return a;end if;
 if a.revision is distinct from p_revision then raise exception 'CONFLICT:其他设备已有新内容';end if;
 elapsed:=a.active_seconds+case when a.resumed_at is not null then greatest(0,extract(epoch from clock_timestamp()-a.resumed_at)) else 0 end;
 update public.attempts set answers=p_answers,revision=revision+1,active_seconds=elapsed,resumed_at=null where id=p_id returning * into a;
 return a;
end$$;

create or replace function public.api_save_attempt(p_id uuid,p_user uuid,p_revision int,p_answers jsonb,p_submit boolean,p_result jsonb default null)
returns public.attempts language plpgsql security invoker set search_path='' as $$
declare a public.attempts;limit_seconds int;finished_at timestamptz;elapsed numeric;
begin
 select * into a from public.attempts where id=p_id and user_id=p_user for update;
 if a.id is null then raise exception '答卷不存在';end if;
 if a.submitted_at is not null then return a;end if;
 if a.revision is distinct from p_revision then raise exception 'CONFLICT:其他设备已有新答案';end if;
 select coalesce((snapshot->>'time_limit')::int,0) into limit_seconds from public.exam_versions where id=a.exam_version_id;
 finished_at:=clock_timestamp();
 elapsed:=a.active_seconds+case when a.resumed_at is not null then greatest(0,extract(epoch from finished_at-a.resumed_at)) else 0 end;
 if limit_seconds>0 and elapsed>limit_seconds and p_answers is distinct from a.answers then
  raise exception '答题时间已到，请刷新载入已保存答案后再提交；未同步的本地答案仍保留';
 end if;
 update public.attempts set answers=p_answers,revision=revision+1,submitted_at=case when p_submit then finished_at else null end,
 duration_seconds=case when p_submit then greatest(0,floor(elapsed))::int else null end,
 active_seconds=elapsed,
 resumed_at=case when p_submit then null else finished_at end,
 score=case when p_submit then (p_result->>'score')::numeric else null end,grades=case when p_submit then p_result->'grades' else null end,
 grading_status=case when p_submit then p_result->>'grading_status' else 'in_progress' end where id=p_id returning * into a;
 return a;
end$$;

-- Called by a graceful shutdown/update job before stopping the stack.
create or replace function public.api_pause_all_open_attempts() returns int
language plpgsql security definer set search_path='' as $$
declare changed int;
begin
 update public.attempts set
  active_seconds=active_seconds+case when resumed_at is not null then greatest(0,extract(epoch from clock_timestamp()-resumed_at)) else 0 end,
  resumed_at=null
 where submitted_at is null and resumed_at is not null;
 get diagnostics changed=row_count;
 return changed;
end$$;
revoke all on function public.api_pause_all_open_attempts() from public,anon,authenticated;
grant execute on function public.api_pause_all_open_attempts() to service_role;
