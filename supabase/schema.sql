create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  phone text not null default '',
  location text not null default '',
  profile_image_key text,
  profile_image_url text,
  completed_at timestamptz,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inquiries (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  pickup_address text not null,
  delivery_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  delivery_lat double precision not null,
  delivery_lng double precision not null,
  cargo_type text not null,
  weight_kg double precision,
  quantity integer not null default 1,
  notes text,
  route_distance_km integer,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inquiries_user_id on public.inquiries(user_id);
create index if not exists idx_inquiries_status on public.inquiries(status);
create index if not exists idx_inquiries_created_at on public.inquiries(created_at);

alter table public.inquiries add column if not exists assigned_admin_id uuid references auth.users(id) on delete set null;
alter table public.inquiries add column if not exists assigned_admin_email text not null default '';
alter table public.inquiries add column if not exists admin_notes text not null default '';
alter table public.inquiries add column if not exists quoted_price numeric(12, 2);
alter table public.inquiries add column if not exists target_pickup_date timestamptz;
alter table public.inquiries add column if not exists target_delivery_date timestamptz;
alter table public.inquiries add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.inquiries add column if not exists driver_location text;
alter table public.inquiries add column if not exists driver_lat double precision;
alter table public.inquiries add column if not exists driver_lng double precision;

create index if not exists idx_inquiries_assigned_admin_id on public.inquiries(assigned_admin_id);
create index if not exists idx_inquiries_assigned_admin_email on public.inquiries(assigned_admin_email);
create index if not exists idx_inquiries_updated_at on public.inquiries(updated_at);

alter table public.inquiries drop constraint if exists inquiries_status_check;
update public.inquiries set status = 'scheduled' where status = 'booked';
update public.inquiries set status = 'delivered' where status = 'completed';
alter table public.inquiries add constraint inquiries_status_check
  check (status in ('new', 'reviewing', 'quoted', 'accepted', 'scheduled', 'for_pickup', 'picked_up', 'in_transit', 'delivered', 'cancelled'));

create table if not exists public.inquiry_images (
  id uuid primary key,
  inquiry_reference text not null references public.inquiries(reference) on delete cascade,
  object_key text,
  public_url text,
  filename text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inquiry_images_reference on public.inquiry_images(inquiry_reference);

create table if not exists public.inquiry_status_history (
  id uuid primary key,
  inquiry_reference text not null references public.inquiries(reference) on delete cascade,
  status text not null,
  notes text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inquiry_status_history_reference on public.inquiry_status_history(inquiry_reference);

alter table public.inquiry_status_history drop constraint if exists inquiry_status_history_status_check;
update public.inquiry_status_history set status = 'scheduled' where status = 'booked';
update public.inquiry_status_history set status = 'delivered' where status = 'completed';
alter table public.inquiry_status_history add constraint inquiry_status_history_status_check
  check (status in ('new', 'reviewing', 'quoted', 'accepted', 'scheduled', 'for_pickup', 'picked_up', 'in_transit', 'delivered', 'cancelled'));

alter table public.user_profiles enable row level security;
alter table public.inquiries enable row level security;
alter table public.inquiry_images enable row level security;
alter table public.inquiry_status_history enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id::text = auth.uid()::text
      and role = 'admin'
  );
$$;

drop policy if exists "Users can read their own profile" on public.user_profiles;
create policy "Users can read their own profile"
  on public.user_profiles for select
  using (auth.uid()::text = id::text);

drop policy if exists "Admins can read all profiles" on public.user_profiles;
create policy "Admins can read all profiles"
  on public.user_profiles for select
  using (public.is_admin());

drop policy if exists "Users can read their own inquiries" on public.inquiries;
create policy "Users can read their own inquiries"
  on public.inquiries for select
  using (auth.uid()::text = user_id::text);

drop policy if exists "Admins can read all inquiries" on public.inquiries;
create policy "Admins can read all inquiries"
  on public.inquiries for select
  using (public.is_admin());

drop policy if exists "Users can read their own inquiry images" on public.inquiry_images;
create policy "Users can read their own inquiry images"
  on public.inquiry_images for select
  using (
    exists (
      select 1
      from public.inquiries
      where inquiries.reference = inquiry_images.inquiry_reference
        and inquiries.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Admins can read all inquiry images" on public.inquiry_images;
create policy "Admins can read all inquiry images"
  on public.inquiry_images for select
  using (public.is_admin());

drop policy if exists "Users can read their own inquiry status history" on public.inquiry_status_history;
create policy "Users can read their own inquiry status history"
  on public.inquiry_status_history for select
  using (
    exists (
      select 1
      from public.inquiries
      where inquiries.reference = inquiry_status_history.inquiry_reference
        and inquiries.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Admins can read all inquiry status history" on public.inquiry_status_history;
create policy "Admins can read all inquiry status history"
  on public.inquiry_status_history for select
  using (public.is_admin());

alter table public.inquiries replica identity full;
alter table public.inquiry_images replica identity full;
alter table public.inquiry_status_history replica identity full;
alter table public.user_profiles replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inquiries'
  ) then
    alter publication supabase_realtime add table public.inquiries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inquiry_images'
  ) then
    alter publication supabase_realtime add table public.inquiry_images;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inquiry_status_history'
  ) then
    alter publication supabase_realtime add table public.inquiry_status_history;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_profiles'
  ) then
    alter publication supabase_realtime add table public.user_profiles;
  end if;
end $$;
