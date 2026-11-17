-- OPTIONAL PUBLIC DEMO: fresh empty databases only; explicit opt-in required.
begin;
do $$
declare item record; user_id uuid; login_email text;
begin
 if current_setting('mango.allow_demo_seed',true) is distinct from 'yes' then
  raise exception 'Explicit opt-in required: SET mango.allow_demo_seed = ''yes''';
 end if;
 if exists(select 1 from auth.users) or exists(select 1 from public.profiles) or exists(select 1 from public.exams) then
  raise exception 'Demo initialization requires an empty database';
 end if;
 for item in select * from (values ('admin','admin','admin'),('user','user','visitor'),('tester','tester','tester')) as v(username,password,account_role) loop
  user_id:=gen_random_uuid();
  login_email:=encode(extensions.digest(item.username,'sha256'),'hex')||'@accounts.mango.invalid';
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
  values('00000000-0000-0000-0000-000000000000',user_id,'authenticated','authenticated',login_email,extensions.crypt(item.password,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"],"provisioned":"mango-v1"}','{}',now(),now(),'','','','');
  insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
  values(gen_random_uuid(),user_id,user_id::text,jsonb_build_object('sub',user_id::text,'email',login_email),'email',now(),now());
  insert into public.profiles(id,username,login_id,role,must_change_password,password_changed_at)
  values(user_id,item.username,item.username,item.account_role,false,now());
 end loop;
end $$;
commit;
