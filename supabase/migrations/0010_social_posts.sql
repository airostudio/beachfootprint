-- ============================================================
-- Social posting: every product that goes live for the first time is queued for the store's
-- Facebook Page and Instagram account. The app (lib/social/dispatch.ts) works through the queue;
-- this table is both the queue and the record of what went out where.
--
-- Queued by a trigger rather than in application code because products are published from half a
-- dozen places (product editor, bulk actions, "publish all drafts", AliExpress staging, CSV
-- import). One rule in the database catches all of them, including any added later.
-- Safe to re-run.
-- ============================================================

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  channel text not null check (channel in ('facebook', 'instagram')),
  status text not null default 'PENDING' check (status in ('PENDING', 'POSTING', 'POSTED', 'FAILED', 'SKIPPED')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  external_id text,
  permalink text,
  last_error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One post per product per channel, ever: a product going Draft -> Published -> Draft ->
  -- Published again must not be posted twice.
  unique (product_id, channel)
);

create index if not exists social_posts_queue_idx on social_posts (tenant_id, status, next_attempt_at);

-- Service role only (the app's server code). No policies, so the anon/public key reads nothing.
alter table social_posts enable row level security;

-- Categories whose products must never be posted — Meta removes posts selling adult products and
-- can restrict the whole account, so those categories get switched off here.
alter table categories add column if not exists social_excluded boolean not null default false;

create or replace function queue_social_posts() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status::text <> 'PUBLISHED' then
    return new;
  end if;
  -- Only a product going live for the first time. OUT_OF_STOCK -> PUBLISHED is a restock of
  -- something already in the store, and an unchanged status is just an edit.
  if tg_op = 'UPDATE' then
    if old.status::text in ('PUBLISHED', 'OUT_OF_STOCK') then
      return new;
    end if;
  end if;

  insert into social_posts (tenant_id, product_id, channel)
  values (new.tenant_id, new.id, 'facebook'), (new.tenant_id, new.id, 'instagram')
  on conflict (product_id, channel) do nothing;
  return new;
end;
$$;

drop trigger if exists products_queue_social_posts on products;
create trigger products_queue_social_posts
  after insert or update of status on products
  for each row execute function queue_social_posts();

-- Everything already in the store when this was switched on is recorded as skipped, so turning on
-- social posting doesn't post the whole existing catalogue at once. Any of them can still be
-- posted individually from Admin -> Social.
insert into social_posts (tenant_id, product_id, channel, status, last_error)
select p.tenant_id, p.id, c.channel, 'SKIPPED', 'Already in the store before social posting was set up'
from products p
cross join (values ('facebook'), ('instagram')) as c(channel)
where p.status::text <> 'DRAFT'
on conflict (product_id, channel) do nothing;
