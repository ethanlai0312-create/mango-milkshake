-- A missing profile must still perform an adaptive password hash, without a dummy
-- real account or a stored password hash. Invoked only after bounded auth limits.
grant usage on schema extensions to service_role;
grant execute on function extensions.crypt(text,text),extensions.gen_salt(text,integer),extensions.digest(text,text) to service_role;
create function public.api_auth_dummy_password(p_password text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_password is null or octet_length(p_password)>4096 then raise exception 'Invalid authentication input';end if;
 perform extensions.crypt(encode(extensions.digest(p_password,'sha256'),'hex'),extensions.gen_salt('bf',10));
end;
$$;
revoke all on function public.api_auth_dummy_password(text) from public,anon,authenticated;
grant execute on function public.api_auth_dummy_password(text) to service_role;
notify pgrst,'reload schema';
