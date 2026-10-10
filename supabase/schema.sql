create extension if not exists pgcrypto;

create table if not exists unn_voters (
  reg_no text primary key,
  name text not null,
  phone_number text,
  email text not null,
  level text,
  created_at timestamptz not null default now()
);

alter table unn_voters add column if not exists otp_claimed_at timestamptz;
alter table unn_voters add column if not exists otp_verified_at timestamptz;
alter table unn_voters add column if not exists ballot_submitted_at timestamptz;

create index if not exists unn_voters_otp_claimed_at_idx on unn_voters (otp_claimed_at);
create index if not exists unn_voters_ballot_submitted_at_idx on unn_voters (ballot_submitted_at);

create table if not exists unn_otp_codes (
  id uuid primary key default gen_random_uuid(),
  reg_no text not null references unn_voters(reg_no) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists unn_otp_codes_reg_no_idx on unn_otp_codes (reg_no);
create index if not exists unn_otp_codes_created_at_idx on unn_otp_codes (created_at desc);

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
alter table unn_otp_codes enable row level security;
alter table unn_posts enable row level security;
alter table unn_candidates enable row level security;
alter table unn_votes enable row level security;
