alter table public.profiles add column id_notice_seen boolean not null default false;
-- Existing owners already know their identifiers; only newly provisioned users
-- receive the first-entry dialog. No actual account mappings are embedded here.
update public.profiles set id_notice_seen=true;
notify pgrst,'reload schema';
