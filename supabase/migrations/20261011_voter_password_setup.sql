-- NACOS-UNN: password-based voter authentication.
-- Existing voters remain registered; passwords are initially unset.

ALTER TABLE public.unn_voters
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS setup_code_hash text,
  ADD COLUMN IF NOT EXISTS setup_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_code_used_at timestamptz;

COMMENT ON COLUMN public.unn_voters.password_hash IS
  'Scrypt password hash; NULL until the voter completes account setup.';

COMMENT ON COLUMN public.unn_voters.setup_code_hash IS
  'Hash of the current one-time account setup code. Never store plaintext codes.';
