-- Cache persistente para evitar revalidar o mesmo contato sem necessidade.
-- Revenue Engine / Radar Contatos — 2026-09-07

create table if not exists public.contact_validation_cache (
  fingerprint text primary key,
  bitrix_contact_id text,
  bitrix_company_id text,
  contact_name text not null,
  company_name text not null,
  email_normalized text,
  role_original text,
  bitrix_updated_at timestamptz,
  validation_status text not null,
  confidence numeric not null default 0,
  decision_maker_ok boolean,
  result jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  model text,
  web_calls integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric,
  validated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_validation_cache_bitrix_contact_idx
  on public.contact_validation_cache (bitrix_contact_id)
  where bitrix_contact_id is not null;

create index if not exists contact_validation_cache_company_idx
  on public.contact_validation_cache (bitrix_company_id)
  where bitrix_company_id is not null;

create index if not exists contact_validation_cache_email_idx
  on public.contact_validation_cache (email_normalized)
  where email_normalized is not null;

create index if not exists contact_validation_cache_expires_idx
  on public.contact_validation_cache (expires_at);

alter table public.contact_validation_cache enable row level security;

-- Intencionalmente sem policy para anon/authenticated.
-- A tabela deve ser acessada pela Edge Function com service_role.
-- Isso evita expor a memória de inteligência comercial no navegador.

comment on table public.contact_validation_cache is
  'Cache server-side de validação de contatos do Radar/Revenue Engine. Bitrix continua sendo a fonte da verdade; este cache apenas evita pesquisa repetida.';
