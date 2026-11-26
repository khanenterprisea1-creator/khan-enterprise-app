-- Khan Enterprise · Distribution Sales Ledger — cloud sync table
-- Run once in the Supabase Dashboard → SQL Editor (or via the Supabase CLI).
-- Safe to re-run: table creation, policies and the trigger are all guarded.

create table if not exists public.ledger_state (
  id text primary key default 'main',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ledger_state enable row level security;

-- Table-level grants (Supabase does not always add these for raw-SQL tables).
-- RLS still decides who sees rows: only the authenticated role matches the
-- policies below, so anon gets zero rows even with its grant.
grant select, insert, update on public.ledger_state to anon, authenticated;

-- Only signed-in (authenticated) users may read / write the ledger row.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ledger_state'
      and policyname = 'ledger_state_select_authenticated'
  ) then
    create policy "ledger_state_select_authenticated"
      on public.ledger_state
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ledger_state'
      and policyname = 'ledger_state_insert_authenticated'
  ) then
    create policy "ledger_state_insert_authenticated"
      on public.ledger_state
      for insert
      with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ledger_state'
      and policyname = 'ledger_state_update_authenticated'
  ) then
    create policy "ledger_state_update_authenticated"
      on public.ledger_state
      for update
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Keep updated_at fresh on every write.
create or replace function public.ledger_state_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ledger_state_touch_updated_at on public.ledger_state;

create trigger ledger_state_touch_updated_at
  before update on public.ledger_state
  for each row execute function public.ledger_state_touch_updated_at();
