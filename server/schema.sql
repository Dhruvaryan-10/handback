-- Handback schema (PostgreSQL / Neon). Apply with: npm run db:schema
create table if not exists items (
  id text primary key,
  doc jsonb not null
);

create table if not exists rentals (
  id text primary key,
  paypal_order_id text unique,
  status text not null,
  created_at timestamptz not null,
  doc jsonb not null
);

create table if not exists rental_events (
  id bigserial primary key,
  rental_id text not null references rentals(id),
  at timestamptz not null,
  kind text not null,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists rental_events_rental on rental_events(rental_id, at);

-- Webhook de-duplication: PayPal may deliver the same event more than once.
create table if not exists webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);
