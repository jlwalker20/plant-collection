-- ============================================================
-- The Living Collection — Supabase setup
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run
-- ============================================================

-- One row per stored document: the plant index, the wishlist, and one row of
-- photos per plant. Keeping the shape identical to the app's local storage
-- means the interface code didn't have to change.
create table if not exists collection_kv (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

-- Bump updated_at on every write so the app can skip re-downloading
-- anything it already has cached.
create or replace function touch_collection_kv()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists collection_kv_touch on collection_kv;
create trigger collection_kv_touch
  before insert or update on collection_kv
  for each row execute function touch_collection_kv();

-- ============================================================
-- Access control
-- ============================================================
-- Row Level Security is on, and the only policy requires a signed-in user.
-- Combined with sign-ups disabled in the dashboard, that means exactly the two
-- accounts you create by hand can read or write. Nobody else — not even with
-- the anon key, which is public by design and safe on its own.
alter table collection_kv enable row level security;

drop policy if exists "household members have full access" on collection_kv;
create policy "household members have full access"
  on collection_kv
  for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- After running this:
--   1. Authentication → Sign In / Providers → turn OFF "Allow new users to sign up"
--   2. Authentication → Users → "Add user" twice, once for each of you.
--      Set a password and tick "Auto Confirm User" so no email is needed.
-- ============================================================

-- ============================================================
-- Public view
-- ============================================================
-- A separate table holding one row: the curated snapshot you choose to publish.
-- Anonymous visitors can read this and nothing else. Your real collection stays
-- behind sign-in — nothing appears here until you press Publish in the app.
create table if not exists public_garden (
  id           int primary key default 1,
  payload      jsonb not null,
  published_at timestamptz not null default now(),
  constraint public_garden_single_row check (id = 1)
);

alter table public_garden enable row level security;

drop policy if exists "anyone can read the published garden" on public_garden;
create policy "anyone can read the published garden"
  on public_garden for select
  to anon, authenticated
  using (true);

drop policy if exists "household members publish" on public_garden;
create policy "household members publish"
  on public_garden for all
  to authenticated
  using (true)
  with check (true);
