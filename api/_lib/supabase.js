const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLES = {
  voters: "unn_voters",
  otp_codes: "unn_otp_codes",
  posts: "unn_posts",
  candidates: "unn_candidates",
  votes: "unn_votes",
  voters_with_vote_status: "unn_voters_with_vote_status",
  election_results: "unn_election_results",
};

function assertConfig() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("Supabase environment variables are not configured.");
  }
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

function qs(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });
  return query.toString();
}

export async function supabaseRequest(path, options = {}) {
  assertConfig();
  const query = options.query ? `?${qs(options.query)}` : "";
  const table = TABLES[path] || path;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
  method: options.method || "GET",
    headers: headers(options.headers),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message || data?.error || "Supabase request failed.";
    throw new Error(message);
  }

  return data;
}

export async function getSingle(path, query) {
  const rows = await supabaseRequest(path, { query: { ...query, limit: "1" } });
  return rows?.[0] || null;
}

export async function insertRows(path, rows, mergeDuplicates = "") {
  const headers = mergeDuplicates
    ? { Prefer: "resolution=merge-duplicates,return=representation" }
    : undefined;
  const query = mergeDuplicates ? { on_conflict: mergeDuplicates } : undefined;
  return supabaseRequest(path, {
    method: "POST",
    body: rows,
    query,
    headers,
  });
}


export async function claimOtpRequest(regNo, cooldownSeconds = 60) {
  const result = await supabaseRequest("rpc/claim_unn_otp_request", {
    method: "POST",
    body: {
      p_reg_no: regNo,
      p_cooldown_seconds: cooldownSeconds,
    },
  });

  return result === true;
}
