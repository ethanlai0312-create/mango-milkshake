create index version_attachment_lookup on public.exam_versions using gin(snapshot jsonb_path_ops);
create index draft_attachment_lookup on public.exams using gin(questions jsonb_path_ops);
create function public.api_attachment_visible(p_file uuid,p_user uuid) returns boolean language sql stable set search_path='' as $$
select exists(select 1 from public.exam_versions v join public.exams e on e.published_version_id=v.id where e.status='published' and e.purged_at is null and v.snapshot @> pg_catalog.jsonb_build_object('questions',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('attachments',pg_catalog.jsonb_build_array(p_file::text))))) or exists(select 1 from public.exam_versions v join public.attempts a on a.exam_version_id=v.id where a.user_id=p_user and v.snapshot @> pg_catalog.jsonb_build_object('questions',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('attachments',pg_catalog.jsonb_build_array(p_file::text)))));
$$;
create function public.api_attachment_referenced(p_file uuid) returns boolean language sql stable set search_path='' as $$
select exists(select 1 from public.exam_versions where snapshot @> pg_catalog.jsonb_build_object('questions',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('attachments',pg_catalog.jsonb_build_array(p_file::text))))) or exists(select 1 from public.exams where questions @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('attachments',pg_catalog.jsonb_build_array(p_file::text))));
$$;
revoke all on function public.api_attachment_visible(uuid,uuid),public.api_attachment_referenced(uuid) from public,anon,authenticated;
grant execute on function public.api_attachment_visible(uuid,uuid),public.api_attachment_referenced(uuid) to service_role;
