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
    and (
      status in ('pending', 'submitted', 'confirmed')
    )
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
