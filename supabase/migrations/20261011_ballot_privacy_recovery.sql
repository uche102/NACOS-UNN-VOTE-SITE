-- Durable ballot submission tracking.
-- Do not store registration numbers or candidate selections on-chain.

create table if not exists public.unn_ballot_submissions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique default gen_random_uuid(),
  voter_reg_no text not null references public.unn_voters(reg_no) on delete restrict,
  ballot_ciphertext text not null,
  ballot_commitment text not null,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'confirmed', 'failed')),
  transaction_hash text unique,
  block_number bigint,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  -- One ballot per voter, even after an election reset.
  unique (voter_reg_no)
);

create index if not exists unn_ballot_submissions_status_idx
  on public.unn_ballot_submissions (status, created_at);

create index if not exists unn_ballot_submissions_created_at_idx
  on public.unn_ballot_submissions (created_at desc);

alter table public.unn_ballot_submissions enable row level security;

-- Only trusted server code using the Supabase service role should access
-- ballot submission records. Do not add public or authenticated policies.
