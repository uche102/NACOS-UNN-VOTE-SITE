create extension if not exists pgcrypto;

create table if not exists unn_voters (
  reg_no text primary key,
  name text not null,
  phone_number text,
  email text not null,
  level text,
  created_at timestamptz not null default now()
);

alter table unn_voters add column if not exists otp_verified_at timestamptz;
alter table unn_voters add column if not exists ballot_submitted_at timestamptz;

create index if not exists unn_voters_ballot_submitted_at_idx on unn_voters (ballot_submitted_at);

-- Ballots remain encrypted off-chain; only their commitments are recorded on-chain.
create table if not exists public.unn_ballot_submissions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique default gen_random_uuid(),
  voter_key text not null,
  ballot_ciphertext text not null,
  ballot_commitment text not null,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'confirmed', 'failed')),
  transaction_hash text unique,
  block_number bigint,
  last_error text,
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'unn_ballot_submissions'
      and column_name = 'voter_reg_no'
  ) then
    delete from public.unn_ballot_submissions;

    alter table public.unn_ballot_submissions
      drop constraint if exists unn_ballot_submissions_voter_reg_no_key;
    alter table public.unn_ballot_submissions
      drop column voter_reg_no;
  end if;
end;
$$;

alter table public.unn_ballot_submissions
  add column if not exists voter_key text;

alter table public.unn_ballot_submissions
  alter column voter_key set not null;

create unique index if not exists unn_ballot_submissions_voter_key_idx
  on public.unn_ballot_submissions (voter_key);

alter table public.unn_ballot_submissions
  drop column if exists created_at;

drop index if exists public.unn_ballot_submissions_created_at_idx;
drop index if exists public.unn_ballot_submissions_status_idx;

create index if not exists unn_ballot_submissions_status_idx
  on public.unn_ballot_submissions (status, updated_at);

alter table public.unn_ballot_submissions enable row level security;

update public.unn_voters
set ballot_submitted_at = null
where ballot_submitted_at is not null;

create or replace function public.claim_unn_ballot_submission(
  p_submission_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_count integer;
begin
  update public.unn_ballot_submissions
  set status = 'submitted',
      updated_at = now()
  where submission_id = p_submission_id
    and status = 'pending';

  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end;
$$;

revoke all on function public.claim_unn_ballot_submission(uuid) from public;
revoke all on function public.claim_unn_ballot_submission(uuid) from anon;
revoke all on function public.claim_unn_ballot_submission(uuid) from authenticated;
grant execute on function public.claim_unn_ballot_submission(uuid) to service_role;

create or replace function public.record_unn_ballot_transaction(
  p_submission_id uuid,
  p_commitment text,
  p_transaction_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.unn_ballot_submissions
  set transaction_hash = p_transaction_hash,
      status = 'submitted',
      updated_at = now(),
      last_error = null
  where submission_id = p_submission_id
    and lower(ballot_commitment) = lower(p_commitment)
    and status in ('pending', 'submitted')
    and (
      transaction_hash is null
      or transaction_hash = p_transaction_hash
    );

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.record_unn_ballot_transaction(uuid, text, text) from public;
revoke all on function public.record_unn_ballot_transaction(uuid, text, text) from anon;
revoke all on function public.record_unn_ballot_transaction(uuid, text, text) from authenticated;
grant execute on function public.record_unn_ballot_transaction(uuid, text, text) to service_role;

create or replace function public.finalize_unn_ballot_submission(
  p_submission_id uuid,
  p_commitment text,
  p_transaction_hash text,
  p_block_number bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  finalized_count integer;
begin
  update public.unn_ballot_submissions
  set status = 'confirmed',
      transaction_hash = p_transaction_hash,
      block_number = p_block_number,
      confirmed_at = coalesce(confirmed_at, now()),
      updated_at = now(),
      last_error = null
  where submission_id = p_submission_id
    and lower(ballot_commitment) = lower(p_commitment)
    and status in ('pending', 'submitted', 'confirmed')
    and (
      transaction_hash is null
      or transaction_hash = p_transaction_hash
    )
    and (
      block_number is null
      or block_number = p_block_number
    );

  get diagnostics finalized_count = row_count;
  return finalized_count = 1;
end;
$$;

revoke all on function public.finalize_unn_ballot_submission(uuid, text, text, bigint) from public;
revoke all on function public.finalize_unn_ballot_submission(uuid, text, text, bigint) from anon;
revoke all on function public.finalize_unn_ballot_submission(uuid, text, text, bigint) from authenticated;
grant execute on function public.finalize_unn_ballot_submission(uuid, text, text, bigint) to service_role;

create table if not exists unn_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  eligible_level text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table unn_posts add column if not exists eligible_level text;

create table if not exists unn_candidates (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references unn_posts(id) on delete cascade,
  name text not null,
  tagline text,
  image_url text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists unn_votes (
  id uuid primary key default gen_random_uuid(),
  reg_no text not null references unn_voters(reg_no) on delete restrict,
  post_id uuid not null references unn_posts(id) on delete restrict,
  candidate_id uuid not null references unn_candidates(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (reg_no, post_id)
);

create index if not exists unn_votes_reg_no_idx on unn_votes (reg_no);
create index if not exists unn_votes_post_id_idx on unn_votes (post_id);
create index if not exists unn_votes_candidate_id_idx on unn_votes (candidate_id);
create index if not exists unn_votes_created_at_idx on unn_votes (created_at desc);
create index if not exists unn_candidates_post_id_idx on unn_candidates (post_id);
create index if not exists unn_posts_display_order_idx on unn_posts (display_order);
create index if not exists unn_posts_eligible_level_idx on unn_posts (eligible_level);

create or replace view unn_voters_with_vote_status as
select
  v.reg_no,
  v.name,
  v.phone_number,
  v.email,
  v.level,
  exists(
    select 1
    from unn_votes
    where unn_votes.reg_no = v.reg_no
  ) as has_voted,
  min(unn_votes.created_at) as voted_at
from unn_voters v
left join unn_votes on unn_votes.reg_no = v.reg_no
group by v.reg_no, v.name, v.phone_number, v.email, v.level;
create or replace view unn_election_results as
select
  p.id as post_id,
  p.title as post_title,
  p.eligible_level as post_eligible_level,
  p.display_order as post_order,
  c.id as candidate_id,
  c.name as candidate_name,
  c.display_order as candidate_order,
  count(v.id) as vote_count
from unn_posts p
join unn_candidates c on c.post_id = p.id
left join unn_votes v on v.candidate_id = c.id and v.post_id = p.id
where p.is_active = true and c.is_active = true
group by p.id, p.title, p.eligible_level, p.display_order, c.id, c.name, c.display_order;

alter table unn_voters enable row level security;
alter table unn_posts enable row level security;
alter table unn_candidates enable row level security;
alter table unn_votes enable row level security;
