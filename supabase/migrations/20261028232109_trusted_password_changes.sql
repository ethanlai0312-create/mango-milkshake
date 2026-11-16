create table private.password_change_permits(user_id uuid primary key references auth.users(id) on delete cascade,nonce_hash text not null check(length(nonce_hash)=64),expires_at timestamptz not null);
alter table private.password_change_permits enable row level security;
revoke all on private.password_change_permits from public,anon,authenticated;
create function public.api_authorize_password_change(p_user uuid,p_nonce_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_user and active) then raise exception '账号不可用';end if;
 insert into private.password_change_permits values(p_user,p_nonce_hash,now()+interval '1 minute') on conflict(user_id) do update set nonce_hash=excluded.nonce_hash,expires_at=excluded.expires_at;
end$$;
revoke all on function public.api_authorize_password_change(uuid,text) from public,anon,authenticated;
grant execute on function public.api_authorize_password_change(uuid,text) to service_role;
create function private.guard_password_change() returns trigger language plpgsql security definer set search_path='' as $$
declare nonce text;expected text;
begin
 select raw_app_meta_data->>'password_change_nonce' into nonce from auth.users where id=new.id;
 if nonce is null then raise exception '请通过平台安全密码接口修改密码';end if;
 expected=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(nonce,'UTF8')),'hex');
 delete from private.password_change_permits where user_id=new.id and nonce_hash=expected and expires_at>now();
 if not found then raise exception '请通过平台安全密码接口修改密码';end if;
 return new;
end$$;
revoke all on function private.guard_password_change() from public,anon,authenticated;
create constraint trigger require_trusted_password_change after update on auth.users deferrable initially deferred for each row when(old.encrypted_password is not null and old.encrypted_password<>'' and old.encrypted_password is distinct from new.encrypted_password) execute function private.guard_password_change();
