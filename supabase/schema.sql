-- Future migration; not applied automatically.
create table public.links (
  code text primary key check (code ~ '^[A-Z0-9_-]{1,32}$'),
  business text not null,
  destination text not null check (destination ~ '^https?://'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.links enable row level security;
-- No public policies: anonymous clients cannot read or modify links.
-- A future server-only adapter must validate URLs and use a private service key.
