-- Radar de Contatos e Decisores — schema do Supabase
-- Rode este script uma vez: Supabase → SQL Editor → New query → cole e Run.

create table if not exists jobs (
  id text primary key,
  data jsonb not null
);

create table if not exists contacts (
  id text primary key,
  job_id text not null,
  data jsonb not null
);
create index if not exists contacts_job_id_idx on contacts (job_id);

create table if not exists analyses (
  contact_id text primary key,
  job_id text not null,
  data jsonb not null
);
create index if not exists analyses_job_id_idx on analyses (job_id);

-- Acesso via chave anon (app estático, sem login).
-- Atenção: qualquer pessoa com a URL + chave anon pode ler/escrever nessas tabelas.
alter table jobs enable row level security;
alter table contacts enable row level security;
alter table analyses enable row level security;

drop policy if exists "radar_all_jobs" on jobs;
create policy "radar_all_jobs" on jobs for all using (true) with check (true);

drop policy if exists "radar_all_contacts" on contacts;
create policy "radar_all_contacts" on contacts for all using (true) with check (true);

drop policy if exists "radar_all_analyses" on analyses;
create policy "radar_all_analyses" on analyses for all using (true) with check (true);
