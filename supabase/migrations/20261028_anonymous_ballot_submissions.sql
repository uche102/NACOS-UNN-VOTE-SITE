-- Existing rows contain a direct voter link. Purge them before removing it.
-- Do not apply this migration if those historic ballots must be retained.
begin;

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

create index unn_ballot_submissions_status_idx
  on public.unn_ballot_submissions (status, updated_at);

update public.unn_voters
set ballot_submitted_at = null
where ballot_submitted_at is not null;

commit;
