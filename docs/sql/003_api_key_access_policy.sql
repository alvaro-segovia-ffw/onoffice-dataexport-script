alter table api_keys
  add column if not exists access_policy jsonb not null default '{}'::jsonb;
