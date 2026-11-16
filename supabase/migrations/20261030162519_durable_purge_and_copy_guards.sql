create or replace function public.api_purge_exam(p_id uuid,p_actor uuid,p_title text) returns void language plpgsql security invoker set search_path='' as $$
declare e public.exams;f public.files;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and active) then raise exception '无权限';end if;
 select * into e from public.exams where id=p_id for update;
 if e.id is null or e.status<>'deleted' then raise exception '试卷不在回收站';end if;
 if p_title is distinct from e.title then raise exception '确认名称不匹配';end if;
 if e.purged_at is not null then return;end if;
 update public.exams set questions='[]',description='',tags='[]',review_reason=null,published_version_id=null,purged_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=p_id;
 delete from public.exam_versions v where v.exam_id=p_id and not exists(select 1 from public.attempts a where a.exam_version_id=v.id);
 for f in select * from public.files where exam_id=p_id and purpose='attachment' order by id for update loop
  if not public.api_attachment_referenced(f.id) then
   delete from public.files where id=f.id;
   insert into private.storage_cleanup(path) values(f.path) on conflict do nothing;
  end if;
 end loop;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'exam_purged_preserving_history',p_id::text);
end$$;

create function public.api_copy_exam(p_id uuid,p_actor uuid) returns public.exams language plpgsql security invoker set search_path='' as $$
declare e public.exams;result public.exams;fid uuid;
begin
 select * into e from public.exams where id=p_id for share;
 if e.id is null or e.purged_at is not null then raise exception '试卷不存在或已永久清除';end if;
 if not exists(select 1 from public.profiles where id=p_actor and active and (id=e.owner_id or role='admin')) then raise exception '无权限';end if;
 for fid in select distinct attachment.value::uuid from jsonb_array_elements(e.questions) question cross join lateral jsonb_array_elements_text(coalesce(question->'attachments','[]'::jsonb)) attachment(value) order by attachment.value::uuid loop
  perform 1 from public.files where id=fid and purpose='attachment' and verified for key share;
  if not found then raise exception '原试卷附件已删除，请检查后重新复制';end if;
 end loop;
 insert into public.exams(owner_id,title,description,subject,tags,questions,time_limit,repeat_allowed,reveal_answers,show_explanations)
 values(p_actor,left(e.title,195)||'（副本）',e.description,e.subject,e.tags,e.questions,e.time_limit,e.repeat_allowed,e.reveal_answers,e.show_explanations) returning * into result;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'exam_copied',result.id::text);
 return result;
end$$;
revoke all on function public.api_copy_exam(uuid,uuid) from public,anon,authenticated;
grant execute on function public.api_copy_exam(uuid,uuid) to service_role;

create function public.api_update_shared_file(p_id uuid,p_actor uuid,p_name text,p_description text,p_category text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and active) then raise exception '无权限';end if;
 if length(trim(p_name))=0 then raise exception '文件名称不能为空';end if;
 update public.files set name=left(p_name,200),description=left(p_description,2000),category=left(p_category,100) where id=p_id and purpose='shared';
 if not found then raise exception '共享文件不存在或已删除';end if;
 insert into public.audit_logs(actor_id,event,entity_id) values(p_actor,'shared_file_updated',p_id::text);
end$$;
revoke all on function public.api_update_shared_file(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.api_update_shared_file(uuid,uuid,text,text,text) to service_role;
