create function public.api_claim_bootstrap(p_hash text) returns boolean language plpgsql set search_path='' as $$declare n int;begin update private.bootstrap set used=true where token_hash=p_hash and not used;get diagnostics n=row_count;return n=1;end$$;
create function public.api_complete_registration(p_username text,p_user uuid) returns void language sql set search_path='' as $$update private.registrations set user_id=p_user where username=p_username and user_id is null$$;
revoke all on function public.api_claim_bootstrap(text),public.api_complete_registration(text,uuid) from public,anon,authenticated;
grant execute on function public.api_claim_bootstrap(text),public.api_complete_registration(text,uuid) to service_role;
