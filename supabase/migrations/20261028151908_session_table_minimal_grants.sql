-- Only the trusted Edge service role can check/revoke sessions. No client grants.
grant select(id,user_id,not_after),delete on auth.sessions to service_role;
