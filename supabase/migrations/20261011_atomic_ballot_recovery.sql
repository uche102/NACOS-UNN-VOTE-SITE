-- Atomic state transitions for durable ballot submissions.
-- This function does not send blockchain transactions.
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
