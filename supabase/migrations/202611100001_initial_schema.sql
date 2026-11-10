-- TV One initial production schema.
-- Browser clients do not access these tables directly. The API uses the
-- Supabase service role after verifying the administrator or device identity.
create extension if not exists pgcrypto;

create type public.media_kind as enum ('image', 'video');
create type public.media_status as enum ('uploading', 'ready', 'failed');
create type public.device_status as enum ('active', 'revoked');

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  kind public.media_kind not null,
  status public.media_status not null default 'uploading',
  original_name text not null check (char_length(original_name) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, venue_id),
  check (
    (kind = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'))
    or
    (kind = 'video' and mime_type in ('video/mp4', 'video/webm', 'video/quicktime'))
  )
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  pairing_secret_hash text not null unique,
  status public.device_status not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, venue_id)
);

create table public.device_assignments (
  device_id uuid primary key,
  venue_id uuid not null,
  media_asset_id uuid not null,
  revision bigint not null default 1 check (revision > 0),
  started_at timestamptz not null default now(),
  image_duration_ms integer not null default 10000 check (image_duration_ms between 1000 and 3600000),
  updated_at timestamptz not null default now(),
  foreign key (device_id, venue_id)
    references public.devices(id, venue_id) on delete cascade,
  foreign key (media_asset_id, venue_id)
    references public.media_assets(id, venue_id) on delete restrict
);

create index venues_active_idx on public.venues (is_active, name);
create index media_assets_venue_created_idx on public.media_assets (venue_id, created_at desc);
create index devices_venue_status_idx on public.devices (venue_id, status);
create index assignments_asset_idx on public.device_assignments (media_asset_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger venues_set_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

create trigger devices_set_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

create trigger assignments_set_updated_at
before update on public.device_assignments
for each row execute function public.set_updated_at();

-- Deny direct browser access by default. The API performs explicit authorization
-- and accesses these tables using the server-only service-role key.
alter table public.admin_profiles enable row level security;
alter table public.venues enable row level security;
alter table public.media_assets enable row level security;
alter table public.devices enable row level security;
alter table public.device_assignments enable row level security;

-- Private bucket; uploads and downloads are proxied/signed by the trusted API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tv-media',
  'tv-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
