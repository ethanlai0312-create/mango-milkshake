drop trigger require_provisioned_signup on auth.users;
create or replace function private.guard_signup() returns trigger language plpgsql set search_path='' as $$begin if not exists(select 1 from auth.users where id=new.id and raw_app_meta_data->>'provisioned'='mango-v1') then raise exception 'Invite registration required';end if;return new;end$$;
create constraint trigger require_provisioned_signup after insert on auth.users deferrable initially deferred for each row execute function private.guard_signup();
