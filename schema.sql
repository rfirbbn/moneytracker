-- ===== MoneyTrack database =====
-- Run ONCE in Supabase: SQL Editor -> New query -> paste everything -> Run.
-- Every table is locked with Row Level Security: a user can only see and change their own rows.

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  target numeric not null check (target > 0),
  saved numeric not null default 0 check (saved >= 0),
  monthly numeric not null check (monthly > 0),
  created_at timestamptz not null default now()
);

create table recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  category text not null default 'Other',
  day int not null check (day between 1 and 28),
  next_month text not null,            -- 'YYYY-MM' of the next transaction to create
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  category text not null default 'Other',
  date date not null default current_date,
  goal_id uuid references goals(id) on delete set null,
  recurring_id uuid references recurring(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Stops a recurring transaction from being created twice for the same day
create unique index transactions_recurring_once on transactions (recurring_id, date);
create index transactions_user_date on transactions (user_id, date desc);

create table budgets (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null,
  monthly_limit numeric not null check (monthly_limit > 0),
  primary key (user_id, category)
);

-- Row Level Security
alter table goals enable row level security;
alter table recurring enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;

create policy "own goals" on goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own recurring" on recurring for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own transactions" on transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own budgets" on budgets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
