alter table public.attempts add column if not exists redo_of_attempt_id uuid references public.attempts(id) on delete set null;
alter table public.attempts add column if not exists redo_question_ids uuid[] not null default '{}';
alter table public.attempts add column if not exists redo_question_numbers int[] not null default '{}';

-- An open regular attempt and one open redo attempt per source may coexist.
drop index if exists public.one_open_attempt;
create unique index one_open_attempt on public.attempts(
 user_id,exam_version_id,coalesce(redo_of_attempt_id,'00000000-0000-0000-0000-000000000000'::uuid)
) where submitted_at is null;
create index if not exists attempts_redo_source on public.attempts(redo_of_attempt_id) where redo_of_attempt_id is not null;

create or replace function public.api_start_attempt(p_exam uuid,p_user uuid) returns public.attempts
language plpgsql security invoker set search_path='' as $$
declare e public.exams;a public.attempts;v public.exam_versions;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_exam::text,0));
 select * into e from public.exams where id=p_exam and status='published';
 if e.id is null then raise exception '试卷未发布';end if;
 select * into a from public.attempts where user_id=p_user and exam_version_id=e.published_version_id and submitted_at is null and redo_of_attempt_id is null;
 if a.id is not null then return a;end if;
 if not e.repeat_allowed and exists(select 1 from public.attempts where user_id=p_user and exam_version_id=e.published_version_id and redo_of_attempt_id is null) then raise exception '本试卷不允许重复答题';end if;
 select * into v from public.exam_versions where id=e.published_version_id;
 insert into public.attempts(user_id,exam_id,exam_version_id,max_score)values(p_user,p_exam,v.id,v.max_score)returning * into a;
 return a;
end$$;

-- Redo attempts must never affect the official leaderboard.
create or replace function public.api_leaderboard(p_version uuid,p_limit int default 50,p_offset int default 0,p_viewer uuid default null)
returns table(user_id uuid,username text,score numeric,max_score numeric,duration_seconds int,rank bigint)
language sql security invoker set search_path='' as $$
 with best as(select distinct on (a.user_id) a.user_id,a.score,a.max_score,a.duration_seconds,a.submitted_at,a.id from public.attempts a join public.profiles p on p.id=a.user_id where a.exam_version_id=p_version and a.grading_status='final' and a.redo_of_attempt_id is null and p.active and (p_viewer is null or public.api_visibility_visible(p_viewer,a.user_id)) order by a.user_id,a.score desc,a.duration_seconds,a.submitted_at,a.id),
 ranked as(select b.user_id,p.username,b.score,b.max_score,b.duration_seconds,dense_rank()over(order by b.score desc,b.duration_seconds)rank,b.submitted_at,b.id from best b join public.profiles p on p.id=b.user_id)
 select r.user_id,r.username,r.score,r.max_score,r.duration_seconds,r.rank from ranked r order by r.score desc,r.duration_seconds,r.submitted_at,r.id limit least(p_limit,100) offset greatest(0,p_offset)
$$;
revoke all on function public.api_leaderboard(uuid,int,int,uuid) from public,anon,authenticated;
grant execute on function public.api_leaderboard(uuid,int,int,uuid) to service_role;

notify pgrst,'reload schema';
