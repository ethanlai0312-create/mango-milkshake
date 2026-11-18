-- Public nicknames may contain foreign scripts, symbols and emoji sequences.
-- Keep the 1..32 grapheme limit in the API/UI, and allow enough code points here
-- for composed emoji (ZWJ, variation selectors, flags, keycaps, tags).
create or replace function public.api_complete_identity_registration(p_user uuid,p_reservation uuid,p_nickname text)
returns void language plpgsql security invoker set search_path='' as $$
declare reg private.identity_registrations; inv public.invites; canonical text; display_name text:=btrim(p_nickname);
begin
 if display_name is null or length(display_name) not between 1 and 512 or display_name ~ '[[:cntrl:]]' then raise exception '昵称格式无效';end if;
 select login_id_key into canonical from private.identity_registrations where reservation=p_reservation;
 if canonical is null then raise exception '注册预约不存在或已完成';end if;
 perform pg_advisory_xact_lock(hashtextextended('mango-login-id:'||canonical,0));
 select * into reg from private.identity_registrations where reservation=p_reservation for update;
 if reg.reservation is null or reg.user_id is not null then raise exception '注册预约不存在或已完成';end if;
 select * into inv from public.invites where id=reg.invite_id for update;
 if inv.id is null or inv.revoked or inv.expires_at<=clock_timestamp() or inv.login_id_key<>canonical then raise exception '密令无效、过期、已用尽或与ID不匹配';end if;
 if exists(select 1 from public.profiles where login_id_key=canonical) then raise exception 'ID已注册，不能重复使用';end if;
 insert into public.profiles(id,username,login_id,must_change_password,is_test_account) values(p_user,display_name,inv.login_id,false,inv.test_only);
 update private.identity_registrations set user_id=p_user where reservation=p_reservation;
end$$;

create or replace function public.api_update_identity_settings(p_user uuid,p_settings jsonb,p_nickname text)
returns public.profiles language plpgsql security invoker set search_path='' as $$
declare result public.profiles; display_name text:=btrim(p_nickname);
begin
 if display_name is null or length(display_name) not between 1 and 512 or display_name ~ '[[:cntrl:]]' then raise exception '昵称格式无效';end if;
 update public.profiles set username=display_name,settings=p_settings where id=p_user and active returning * into result;
 if result.id is null then raise exception '账号不可用';end if;
 return result;
end$$;
