CREATE OR REPLACE FUNCTION public.complete_unn_voter_password_setup(
  p_reg_no text,
  p_setup_code_hash text,
  p_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  voter_row public.unn_voters%ROWTYPE;
BEGIN
  SELECT *
    INTO voter_row
    FROM public.unn_voters
   WHERE reg_no = upper(trim(p_reg_no))
   FOR UPDATE;

  IF NOT FOUND
     OR voter_row.password_hash IS NOT NULL
     OR voter_row.setup_code_hash IS NULL
     OR voter_row.setup_code_hash <> p_setup_code_hash
     OR voter_row.setup_code_used_at IS NOT NULL
     OR voter_row.setup_code_expires_at IS NULL
     OR voter_row.setup_code_expires_at <= now()
  THEN
    RETURN false;
  END IF;

  UPDATE public.unn_voters
     SET password_hash = p_password_hash,
         setup_code_hash = NULL,
         setup_code_used_at = now()
   WHERE reg_no = voter_row.reg_no;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_unn_voter_password_setup(text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_unn_voter_password_setup(text, text, text)
  TO service_role;
