-- Recheck the deadline under the answer-row lock; an API precheck can become
-- stale while a request waits in a queue. One server timestamp drives both fields.
create or replace function public.api_save_attempt(p_id uuid,p_user uuid,p_revision int,p_answers jsonb,p_submit boolean,p_result jsonb default null)
returns public.attempts language plpgsql security invoker set search_path='' as $$
declare a public.attempts;limit_seconds int;finished_at timestamptz;
begin
 select * into a from public.attempts where id=p_id and user_id=p_user for update;
 if a.id is null then raise exception '答卷不存在';end if;
 if a.submitted_at is not null then return a;end if;
 if a.revision is distinct from p_revision then raise exception 'CONFLICT:其他设备已有新答案';end if;
 select coalesce((snapshot->>'time_limit')::int,0) into limit_seconds from public.exam_versions where id=a.exam_version_id;
 finished_at:=clock_timestamp();
 if limit_seconds>0 and finished_at>a.started_at+make_interval(secs=>limit_seconds) and p_answers is distinct from a.answers then
  raise exception '答题时间已到，请刷新载入已保存答案后再提交；未同步的本地答案仍保留';
 end if;
 update public.attempts set answers=p_answers,revision=revision+1,submitted_at=case when p_submit then finished_at else null end,
 duration_seconds=case when p_submit then greatest(0,floor(extract(epoch from finished_at-started_at)))::int else null end,
 score=case when p_submit then (p_result->>'score')::numeric else null end,grades=case when p_submit then p_result->'grades' else null end,
 grading_status=case when p_submit then p_result->>'grading_status' else 'in_progress' end where id=p_id returning * into a;
 return a;
end$$;
