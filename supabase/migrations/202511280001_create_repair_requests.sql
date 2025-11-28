-- Migration: Create tables for repair booking requests
-- 
-- This migration defines the core database tables used by the
-- pricing / repair booking wizard in the Astro app.
--
-- How this maps to the UI (see `ServicesPage.astro`):
-- - Step 1 (Category/Brand/Model/Variant) → device fields
-- - Step 2 (Repair + OEM/Aftermarket choice) → repair_* fields
-- - Step 3 (Booking form) → customer_* and issue_description
--
-- Run this in your Supabase SQL editor or via Supabase CLI migrations.

-- Ensure pgcrypto is available for gen_random_uuid()
create extension if not exists "pgcrypto";

-- Helper function to keep updated_at in sync
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Main table to store each repair booking / quote request
create table if not exists public.repair_requests (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Customer details (Step 3 form)
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  issue_description text,

  -- Device selection (Step 1)
  category text not null,
  brand text not null,
  model text,
  variant text,

  -- Repair selection (Step 2)
  repair_id text not null,
  repair_label text not null,
  repair_quality text not null check (repair_quality in ('oem', 'aftermarket')),
  repair_price numeric(10,2) not null,

  -- Workflow status for your internal tracking
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'completed', 'cancelled'))
);

-- Trigger to keep updated_at current on updates
drop trigger if exists set_timestamp on public.repair_requests;
create trigger set_timestamp
before update on public.repair_requests
for each row
execute procedure public.set_current_timestamp_updated_at();

-- Optional: table to store references to uploaded photos for each request.
-- The Edge Function handling the form submission can:
-- 1. Upload each file into a Storage bucket (e.g. "repair-photos")
-- 2. Insert a row here per photo, referencing the request id.
create table if not exists public.repair_request_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  repair_request_id uuid not null
    references public.repair_requests(id) on delete cascade,

  storage_bucket text not null default 'repair-photos',
  storage_path text not null
);

-- RLS: you will typically interact with these tables via service role
-- (Edge Functions / server-side code). By default new tables in Supabase
-- have RLS disabled; uncomment the lines below if you want to enable RLS
-- and then add policies tailored to your needs.
--
-- alter table public.repair_requests enable row level security;
-- alter table public.repair_request_photos enable row level security;
--
-- Example very-open policy (ONLY if all access is via service role key):
-- create policy "service role full access on repair_requests"
--   on public.repair_requests
--   for all
--   using (true)
--   with check (true);
--
-- create policy "service role full access on repair_request_photos"
--   on public.repair_request_photos
--   for all
--   using (true)
--   with check (true);


