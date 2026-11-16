create function public.api_history_query(p_user uuid,p_all boolean default false,p_version uuid default null,p_sort text default 'date',p_offset int default 0) returns jsonb language sql set search_path='' as $$
with base as (
 select a.id,a.user_id,a.exam_id,a.exam_version_id,a.score,a.max_score,a.duration_seconds,a.submitted_at,a.grading_status,p.username,v.snapshot->>'title' title,v.number version_number,
 row_number()over(partition by a.user_id,a.exam_id order by a.started_at,a.id) attempt_number
 from public.attempts a join public.profiles p on p.id=a.user_id join public.exam_versions v on v.id=a.exam_version_id
 where (not p_all and a.user_id=p_user) or (p_all and exists(select 1 from public.profiles actor where actor.id=p_user and actor.role='admin' and actor.active))
), filtered as(select * from base where submitted_at is not null and (p_version is null or exam_version_id=p_version)), ranked as(
 select * from filtered order by case when p_sort='score' then score end desc nulls last,case when p_sort='duration' then duration_seconds end asc nulls last,submitted_at desc,id limit 50 offset greatest(0,p_offset)
), filters as(select distinct exam_version_id id,title,version_number number from base where submitted_at is not null)
select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r)) from ranked r),'[]'::jsonb),'filters',coalesce((select jsonb_agg(to_jsonb(f) order by f.title,f.number desc) from filters f),'[]'::jsonb),'stats',(select jsonb_build_object('count',count(*),'best_score',max(score)filter(where grading_status='final'),'best_percent',round(max(score/nullif(max_score,0)*100)filter(where grading_status='final'),2),'fastest_seconds',min(duration_seconds),'total_seconds',coalesce(sum(duration_seconds),0))from filtered))
$$;
revoke all on function public.api_history_query(uuid,boolean,uuid,text,int) from public,anon,authenticated;
grant execute on function public.api_history_query(uuid,boolean,uuid,text,int) to service_role;
