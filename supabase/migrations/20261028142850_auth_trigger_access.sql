grant usage on schema private to supabase_auth_admin;
revoke all on function private.guard_signup() from public,anon,authenticated;
grant execute on function private.guard_signup() to supabase_auth_admin;
