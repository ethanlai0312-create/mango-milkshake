-- v2026.11.18.01 follow-up: the trusted account-purge routine must be able to
-- replace the login ID with an internal tombstone value. Normal accounts still
-- cannot change their login ID; only the purge transition (purged_at set) is exempt.
create or replace function private.guard_login_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.login_id is distinct from old.login_id then
  -- A one-time operator backfill is permitted only inside its explicit transaction.
  -- Browser/API service roles cannot change this identifier, even with a custom GUC.
  if not (new.purged_at is not null and old.purged_at is null) then
   if current_user not in ('postgres','supabase_admin') or current_setting('mango.identity_migration',true) is distinct from 'on' then
    raise exception using errcode='42501',message='登录ID不能修改';
   end if;
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('mango-login-id:'||lower(new.login_id collate "C"),0));
 return new;
end$$;
notify pgrst,'reload schema';
