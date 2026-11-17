-- v2026.11.17.04: remove administrator TOTP enforcement and residual MFA state.
-- The application no longer gates logins or sensitive actions on TOTP.
delete from auth.mfa_amr_claims;
delete from auth.mfa_challenges;
delete from auth.mfa_factors;
drop table if exists private.admin_step_up_use;
drop function if exists public.api_consume_admin_step_up(uuid,uuid,bigint);
notify pgrst, 'reload schema';
