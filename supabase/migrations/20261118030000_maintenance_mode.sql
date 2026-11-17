-- v2026.11.18.08 maintenance mode defaults
insert into public.system_config(key,value) values
 ('maintenance_active','false'::jsonb),
 ('maintenance_until','null'::jsonb),
 ('maintenance_message',to_jsonb('服务器正在维护或添加功能，请稍等预计5~10分钟恢复'::text))
on conflict (key) do nothing;
notify pgrst,'reload schema';
