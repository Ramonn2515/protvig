-- Execute uma vez no Supabase SQL Editor.
-- Confirmação de leitura individual, por cliente e por registro.
create table if not exists public.occurrence_reads (
  occurrence_id bigint not null references public.occurrences(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (occurrence_id, user_id)
);
create index if not exists occurrence_reads_user_idx on public.occurrence_reads(user_id);
alter table public.occurrence_reads enable row level security;

drop policy if exists "protvig_reads_select" on public.occurrence_reads;
create policy "protvig_reads_select" on public.occurrence_reads
for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_protvig_admin()));

drop policy if exists "protvig_reads_insert" on public.occurrence_reads;
create policy "protvig_reads_insert" on public.occurrence_reads
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.occurrences o
    where o.id = occurrence_id
    and public.can_access_protvig_market(o.market_id)
  )
);
-- Clientes não podem alterar ou apagar comprovantes de leitura.
