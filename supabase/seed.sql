-- Local development only: the user the web app signs in as automatically and
-- the CLI seeds for. Keep in sync with apps/cli/src/config.ts and apps/web/.env.development.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'dev@example.com',
  extensions.crypt('dev-password', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Dev User"}',
  now(), now(), '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '{"sub":"00000000-0000-4000-8000-000000000001","email":"dev@example.com","email_verified":true}',
  'email', now(), now(), now()
) on conflict do nothing;
