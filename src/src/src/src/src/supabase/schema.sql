-- =====================================================================
--  AXELOG CONSULTING EVENT'S — schéma Supabase
--  À coller en entier dans Supabase > SQL Editor > New query > Run.
--  Le script peut être relancé sans risque (idempotent).
-- =====================================================================

-- Fonction commune : met à jour updated_at à chaque modification
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1) Tables métier
--    id    : identifiant généré par l'application
--    pos   : position dans la liste (l'ordre du journal de caisse compte)
--    data  : fiche complète au format JSON
-- ---------------------------------------------------------------------
create table if not exists public.axelog_clients (
  id text primary key,
  pos integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.axelog_transactions (
  id text primary key,
  pos integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.axelog_articles (
  id text primary key,
  pos integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.axelog_prestataires (
  id text primary key,
  pos integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.axelog_tasks (
  id text primary key,
  pos integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.axelog_devis (
  id text primary key,
  pos integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.axelog_assignations (
  id text primary key,
  pos integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Réglages : taux de change, devise d'affichage, frais fixes par défaut,
-- profil émetteur (société, coordonnées, logo, signature), compteur de références.
create table if not exists public.axelog_app_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists axelog_clients_pos_idx on public.axelog_clients (pos);
create index if not exists axelog_transactions_pos_idx on public.axelog_transactions (pos);
create index if not exists axelog_articles_pos_idx on public.axelog_articles (pos);
create index if not exists axelog_prestataires_pos_idx on public.axelog_prestataires (pos);
create index if not exists axelog_tasks_pos_idx on public.axelog_tasks (pos);
create index if not exists axelog_devis_pos_idx on public.axelog_devis (pos);
create index if not exists axelog_assignations_pos_idx on public.axelog_assignations (pos);

-- ---------------------------------------------------------------------
-- 2) Déclencheurs updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['axelog_clients','axelog_transactions','axelog_articles','axelog_prestataires','axelog_tasks','axelog_devis','axelog_assignations','axelog_app_settings']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) Sécurité par ligne (RLS) : lecture, création, modification, suppression
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['axelog_clients','axelog_transactions','axelog_articles','axelog_prestataires','axelog_tasks','axelog_devis','axelog_assignations','axelog_app_settings']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to anon, authenticated with check (true)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to anon, authenticated using (true) with check (true)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to anon, authenticated using (true)', t || '_delete', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.axelog_clients, public.axelog_transactions, public.axelog_articles, public.axelog_prestataires,
  public.axelog_tasks, public.axelog_devis, public.axelog_assignations, public.axelog_app_settings
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Stockage des fichiers prestataires (devis, contrats, visuels…)
--    Bucket privé, 10 Mo par fichier.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('prestataire-files', 'prestataire-files', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "prestataire_files_select" on storage.objects;
drop policy if exists "prestataire_files_insert" on storage.objects;
drop policy if exists "prestataire_files_update" on storage.objects;
drop policy if exists "prestataire_files_delete" on storage.objects;

create policy "prestataire_files_select" on storage.objects
  for select to anon, authenticated using (bucket_id = 'prestataire-files');
create policy "prestataire_files_insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'prestataire-files');
create policy "prestataire_files_update" on storage.objects
  for update to anon, authenticated using (bucket_id = 'prestataire-files') with check (bucket_id = 'prestataire-files');
create policy "prestataire_files_delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'prestataire-files');

-- =====================================================================
-- ATTENTION : ces règles donnent l'accès complet à toute personne qui
-- possède l'adresse du site ET la clé anon (visible dans le navigateur).
-- Pour restreindre aux seuls utilisateurs connectés plus tard :
-- remplacer "to anon, authenticated" par "to authenticated" dans les
-- politiques ci-dessus (et ajouter une page de connexion).
-- =====================================================================
