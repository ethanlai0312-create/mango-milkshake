-- Read-only index into each caller's immutable, submitted attempt history.
create function public.api_mistake_exams(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 with items as (
 select a.exam_id,v.snapshot->>'title' title,
 case when jsonb_typeof(a.grades->(q->>'id')->'score')='number' then (a.grades->(q->>'id')->>'score')::numeric end score,
 (q->>'points')::numeric points,a.submitted_at
 from public.attempts a join public.exam_versions v on v.id=a.exam_version_id
 cross join lateral jsonb_array_elements(v.snapshot->'questions') q
 where a.user_id=p_user and a.submitted_at is not null and coalesce(a.grades->(q->>'id')->>'status','pending')='final'
 ), grouped as (
 select exam_id,(array_agg(title order by submitted_at desc))[1] title,
 count(*) filter(where score=0) wrong_count,count(*) filter(where score>0 and score<points) partial_count,max(submitted_at) last_at
 from items where score>=0 and score<points group by exam_id
 ) select coalesce(jsonb_agg(to_jsonb(grouped) order by last_at desc),'[]'::jsonb) from grouped
$$;
create function public.api_mistake_questions(p_user uuid,p_exam uuid,p_mode text default 'wrong',p_offset int default 0)
returns table(attempt_id uuid,question_id text,ordinal bigint,score numeric,points numeric,submitted_at timestamptz)
language sql security invoker set search_path='' as $$
 with items as (
 select a.id attempt_id,q->>'id' question_id,n ordinal,
 case when jsonb_typeof(a.grades->(q->>'id')->'score')='number' then (a.grades->(q->>'id')->>'score')::numeric end score,
 (q->>'points')::numeric points,a.submitted_at
 from public.attempts a join public.exam_versions v on v.id=a.exam_version_id
 cross join lateral jsonb_array_elements(v.snapshot->'questions') with ordinality as t(q,n)
 where a.user_id=p_user and a.exam_id=p_exam and a.submitted_at is not null and coalesce(a.grades->(q->>'id')->>'status','pending')='final'
 ) select * from items where score>=0 and score<points and
 (p_mode='all' or p_mode='wrong' and score=0 or p_mode='partial' and score>0)
 order by submitted_at desc,attempt_id,ordinal limit 10 offset greatest(0,least(p_offset,1000000))
$$;
revoke all on function public.api_mistake_exams(uuid),public.api_mistake_questions(uuid,uuid,text,int) from public,anon,authenticated;
grant execute on function public.api_mistake_exams(uuid),public.api_mistake_questions(uuid,uuid,text,int) to service_role;
notify pgrst,'reload schema';
