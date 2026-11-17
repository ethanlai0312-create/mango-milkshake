create function public.api_users_by_role(p_actor uuid,p_offset int default 0)
returns table(id uuid,username text,login_id text,active boolean,role text,created_at timestamptz,last_login_at timestamptz,password_changed_at timestamptz)
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.role='admin' and p.active) then raise exception using errcode='42501',message='需要管理员权限';end if;
 return query select p.id,p.username,p.login_id,p.active,p.role,p.created_at,p.last_login_at,p.password_changed_at
 from public.profiles p
 order by case p.role when 'admin' then 0 when 'secondary_admin' then 1 when 'tester' then 2 else 3 end,lower(p.username collate "C"),p.id
 limit 50 offset greatest(0,least(p_offset,1000000));
end$$;
revoke all on function public.api_users_by_role(uuid,int) from public,anon,authenticated;
grant execute on function public.api_users_by_role(uuid,int) to service_role;
notify pgrst,'reload schema';
