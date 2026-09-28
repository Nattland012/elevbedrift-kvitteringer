-- Kjør dette i Supabase SQL Editor.
-- Oppretter profiler, kvitteringer, tilgangsregler og privat storage-bucket.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'scanner' check (role in ('scanner','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  merchant text,
  receipt_date date,
  amount numeric(12,2),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.receipts enable row level security;

-- Hjelpefunksjon for å sjekke admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Profiler: bruker kan se sin egen profil.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

-- Kvitteringer: alle innloggede kan opprette sine egne.
drop policy if exists "receipts_insert_own" on public.receipts;
create policy "receipts_insert_own"
on public.receipts for insert
to authenticated
with check (user_id = auth.uid());

-- Kun admin kan lese alle kvitteringer.
drop policy if exists "receipts_select_admin" on public.receipts;
create policy "receipts_select_admin"
on public.receipts for select
to authenticated
using (public.is_admin());

-- Kun admin kan slette.
drop policy if exists "receipts_delete_admin" on public.receipts;
create policy "receipts_delete_admin"
on public.receipts for delete
to authenticated
using (public.is_admin());

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Opplasting: innloggede brukere kan bare laste opp i egen mappe.
drop policy if exists "receipt_upload_own_folder" on storage.objects;
create policy "receipt_upload_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Kun admin kan lese objektene.
drop policy if exists "receipt_read_admin" on storage.objects;
create policy "receipt_read_admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'receipts'
  and public.is_admin()
);

-- Kun admin kan slette objekter.
drop policy if exists "receipt_delete_admin" on storage.objects;
create policy "receipt_delete_admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'receipts'
  and public.is_admin()
);

-- Når dere har opprettet brukerne i Authentication → Users,
-- kjør disse kommandoene med de faktiske UUID-ene:
--
-- insert into public.profiles (id, role)
-- values
--   ('ADMIN-UUID', 'admin'),
--   ('SCANNER1-UUID', 'scanner'),
--   ('SCANNER2-UUID', 'scanner'),
--   ('SCANNER3-UUID', 'scanner');
--
-- Bytt ut UUID-ene før kjøring.
