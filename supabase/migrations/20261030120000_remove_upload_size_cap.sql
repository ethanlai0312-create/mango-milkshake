-- Remove the application file cap. Runtime storage also needs its global setting updated.
begin;
alter table public.files drop constraint if exists files_size_check;
alter table public.files add constraint files_size_positive check(size > 0);
update storage.buckets set file_size_limit=null where id='mango-private';
commit;
