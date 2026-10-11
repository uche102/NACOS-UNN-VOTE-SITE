export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function readStoredToken(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  } catch {
    return sessionStorage.getItem(key) || "";
  }
}

function readVoterToken() {
  try {
    return (
      sessionStorage.getItem("nacosUnnVoterToken") ||
      localStorage.getItem("nacosUnnVoterToken") ||
      ""
    );
  } catch {
    return sessionStorage.getItem("nacosUnnVoterToken") || "";
  }
}

function persistAdminToken(token) {
  try {
    if (token) {
      localStorage.setItem("nacosUnnAdminToken", token);
      sessionStorage.setItem("nacosUnnAdminToken", token);
    } else {
      localStorage.removeItem("nacosUnnAdminToken");
      sessionStorage.removeItem("nacosUnnAdminToken");
    }
  } catch {
    try {
      if (token) {
        sessionStorage.setItem("nacosUnnAdminToken", token);
      } else {
        sessionStorage.removeItem("nacosUnnAdminToken");
      }
    // eslint-disable-next-line no-empty
    } catch {}
  }
}

async function request(path, options = {}) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:10000" : "");
  const voterToken = readVoterToken();
  const adminToken = readStoredToken("nacosUnnAdminToken");
  const isAdminRoute = path.startsWith("/api/admin");

  const authorization =
    options.authorization || (isAdminRoute ? adminToken : voterToken) || "";
  const {
    headers: providedHeaders,
    body,
    query,
    authorization: _ignoredAuthorization,
    ...rest
  } = options;
  const headers = {
    "Content-Type": "application/json",
    ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
    ...(providedHeaders || {}),
  };
  const url = new URL(`${baseUrl}${path}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }
  const response = await fetch(url.toString(), {
    credentials: "include",
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      data.error || data.message || "Request failed.",
      response.status,
      data,
    );
  }
  return data;
}

export const api = {
  setupPassword: (regNo, setupCode, password) =>
    request("/api/setup-password", {
      method: "POST",
      body: { reg_no: regNo, setup_code: setupCode, password },
    }),
  passwordLogin: (regNo, password) =>
    request("/api/password-login", {
      method: "POST",
      body: { reg_no: regNo, password },
    }),
  requestOtp: (regNo) =>
    request("/api/request-otp", { method: "POST", body: { reg_no: regNo } }),
  verifyOtp: (regNo, otp) =>
    request("/api/verify-otp", {
      method: "POST",
      body: { reg_no: regNo, otp },
    }),
  me: () => request("/api/me"),
  election: () => request("/api/election"),
  vote: (selections) =>
    request("/api/vote", { method: "POST", body: { selections } }),
  adminLogin: async (password) => {
    const data = await request("/api/admin/login", {
      method: "POST",
      body: { password },
    });
    if (data.token) {
      persistAdminToken(data.token);
    }
    return data;
  },
  adminSession: () => request("/api/admin/session"),
  electionStatus: () => request("/api/admin/session"),
  setElectionStatus: (votingOpen) =>
    request("/api/admin/session", { method: "PATCH", body: { votingOpen } }),
  adminPosts: () => request("/api/admin/posts"),
  adminVoters: () => request("/api/admin/voters"),
  generateSetupCode: (regNo) =>
    request("/api/admin/setup-code", {
      method: "POST",
      body: { reg_no: regNo },
    }),
  registerVoter: (voter) =>
    request("/api/admin/voters", { method: "POST", body: voter }),
  resetElection: (items) =>
    request("/api/admin/reset-election", { method: "POST", body: { items } }),
  resetVotes: () =>
    request("/api/admin/reset-election", {
      method: "POST",
      body: { items: "votes-only" },
    }),
  savePost: (post) =>
    request("/api/admin/posts", {
      method: post.id ? "PUT" : "POST",
      body: post,
    }),
  deletePost: (id) =>
    request("/api/admin/posts", { method: "DELETE", body: { id } }),
  adminCandidates: () => request("/api/admin/candidates"),
  saveCandidate: (candidate) =>
    request("/api/admin/candidates", {
      method: candidate.id ? "PUT" : "POST",
      body: candidate,
    }),
  deleteCandidate: (id) =>
    request("/api/admin/candidates", { method: "DELETE", body: { id } }),
  votersVoted: (page = 1, perPage = 10) =>
    request("/api/admin/voters-voted", { query: { page, perPage } }),
  results: () => request("/api/admin/results"),
};
