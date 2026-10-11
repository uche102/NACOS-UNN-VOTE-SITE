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
