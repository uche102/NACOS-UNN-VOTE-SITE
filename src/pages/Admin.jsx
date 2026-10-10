import {
  Download,
  Lock,
  PauseCircle,
  Plus,
  RefreshCw,
  Save,
  PlayCircle,
  Trash2,
  Users,
  Vote,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import Papa from "papaparse";

import welcome from "../assets/welcome.jpeg";
import { api } from "../lib/api";
import { positionRank } from "../lib/post-order";

const COLORS = [
  "#0f766e",
  "#2563eb",
  "#c2410c",
  "#7c3aed",
  "#be123c",
  "#15803d",
];

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function emptyCandidate(posts) {
  return {
    id: "",
    post_id: posts[0]?.id || "",
    name: "",
    tagline: "",
    image_url: "",
    display_order: 0,
    is_active: true,
  };
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(
    Boolean(
      localStorage.getItem("nacosUnnAdminToken") ||
        sessionStorage.getItem("nacosUnnAdminToken"),
    ),
  );
  const [activeTab, setActiveTab] = useState("setup");
  const [posts, setPosts] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [voters, setVoters] = useState([]);
  const [results, setResults] = useState([]);
  const [votersLoadedAt, setVotersLoadedAt] = useState("");
  const [resultsLoadedAt, setResultsLoadedAt] = useState("");
  const [votersPage, setVotersPage] = useState(1);
  const [votersPerPage] = useState(10);
  const [votersHasNext, setVotersHasNext] = useState(false);
  const [votersLoading, setVotersLoading] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [electionStatus, setElectionStatus] = useState({
    votingOpen: true,
    updatedAt: "",
  });
  const [postForm, setPostForm] = useState({
    id: "",
    title: "",
    eligible_level: "",
    display_order: 0,
    is_active: true,
  });
  const [candidateForm, setCandidateForm] = useState(emptyCandidate([]));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [importName, setImportName] = useState("");
  const chartRefs = useRef({});
  const fileInputRef = useRef(null);

  async function login(event) {
    event.preventDefault();
    setMessage("");
    try {
      setLoading(true);
      const data = await api.adminLogin(password);
      if (data.token) {
        sessionStorage.removeItem("nacosUnnVoterToken");
        localStorage.setItem("nacosUnnAdminToken", data.token);
        sessionStorage.setItem("nacosUnnAdminToken", data.token);
      }
      setAuthed(true);
      await loadAdminCoreData();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  const loadAdminCoreData = useCallback(async () => {
    try {
      const [postData, candidateData, statusData] = await Promise.all([
        api.adminPosts(),
        api.adminCandidates(),
        api.electionStatus(),
      ]);
      setPosts(postData.posts);
      setCandidates(candidateData.candidates);
      setElectionStatus(statusData);
      setCandidateForm((current) => ({
        ...current,
        post_id: current.post_id || postData.posts[0]?.id || "",
      }));
    } catch (err) {
      const detail = err?.message || "Unable to load admin data.";
      setMessage(detail);
      throw err;
    }
  }, []);

  const loadVoters = useCallback(
    async (page = votersPage) => {
      setVotersLoading(true);
      try {
        const data = await api.votersVoted(page, votersPerPage);
        setVoters(data.voters);
        setVotersPage(data.page);
        setVotersHasNext(data.hasNextPage);
        setVotersLoadedAt(new Date().toISOString());
      } finally {
        setVotersLoading(false);
      }
    },
    [votersPage, votersPerPage],
  );

  const loadResults = useCallback(async () => {
    setResultsLoading(true);
    try {
      const data = await api.results();
      setResults(data.posts);
      setResultsLoadedAt(data.loadedAt || "");
    } finally {
      setResultsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function check() {
      try {
        await api.adminSession();
        setAuthed(true);
        await loadAdminCoreData();
      } catch (err) {
        const status = err?.status;
        if (status === 401 || status === 403) {
          localStorage.removeItem("nacosUnnAdminToken");
          sessionStorage.removeItem("nacosUnnAdminToken");
          setAuthed(false);
          setMessage("Your admin session expired. Please log in again.");
          return;
        }

        setAuthed(true);
        setMessage(
          err?.message ||
            "Session restored, but admin data could not be loaded.",
        );
      }
    }
    check();
  }, [loadAdminCoreData]);

  useEffect(() => {
    if (!authed) return;
    if (activeTab === "voters" && !votersLoadedAt && !votersLoading) {
      loadVoters(1);
    }
    if (activeTab === "results" && !resultsLoadedAt && !resultsLoading) {
      loadResults();
    }
  }, [
    activeTab,
    authed,
    loadAdminCoreData,
    loadResults,
    loadVoters,
    votersLoadedAt,
    resultsLoadedAt,
    votersLoading,
    resultsLoading,
  ]);

  const refreshAdminView = useCallback(async () => {
    await loadAdminCoreData();
    if (activeTab === "results") {
      await loadResults();
    }
    if (activeTab === "voters") {
      await loadVoters(votersPage);
    }
  }, [activeTab, loadAdminCoreData, loadResults, loadVoters, votersPage]);

  async function savePost(event) {
    event.preventDefault();
    setMessage("");
    try {
      setLoading(true);
      await api.savePost(postForm);
      setPostForm({
        id: "",
        title: "",
        eligible_level: "",
        display_order: 0,
        is_active: true,
      });
      await loadAdminCoreData();
      if (activeTab === "results") await loadResults();
      if (activeTab === "voters") await loadVoters(votersPage);
      setMessage("Post saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveCandidate(event) {
    event.preventDefault();
    setMessage("");
    try {
      setLoading(true);
      await api.saveCandidate(candidateForm);
      setCandidateForm(emptyCandidate(posts));
      await loadAdminCoreData();
      if (activeTab === "results") await loadResults();
      if (activeTab === "voters") await loadVoters(votersPage);
      setMessage("Candidate saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function removePost(id) {
    await api.deletePost(id);
    await loadAdminCoreData();
    if (activeTab === "results") await loadResults();
    if (activeTab === "voters") await loadVoters(votersPage);
  }

  async function removeCandidate(id) {
    await api.deleteCandidate(id);
    await loadAdminCoreData();
    if (activeTab === "results") await loadResults();
    if (activeTab === "voters") await loadVoters(votersPage);
  }

  async function resetElection() {
    if (
      !window.confirm(
        "Reset the election setup? This will remove all posts, candidates, and votes.",
      )
    ) {
      return;
    }
    setMessage("");
    try {
      setLoading(true);
      await api.resetElection();
      setPosts([]);
      setCandidates([]);
      setResults([]);
      setVoters([]);
      setVotersPage(1);
      setVotersHasNext(false);
      setPostForm({
        id: "",
        title: "",
        eligible_level: "",
        display_order: 0,
        is_active: true,
      });
      setCandidateForm(emptyCandidate([]));
      await loadAdminCoreData();
      setMessage("Election setup reset.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resetVotes() {
    if (
      !window.confirm(
        "Reset all votes? Posts and candidates will stay, but all submitted votes and OTP state will be cleared.",
      )
    ) {
      return;
    }
    setMessage("");
    try {
      setLoading(true);
      const data = await api.resetVotes();
      setResults([]);
      setVoters([]);
      setVotersPage(1);
      setVotersHasNext(false);
      setResultsLoadedAt("");
      setVotersLoadedAt("");
      setMessage(data.message || "Votes reset.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleVoting(nextOpen) {
    setMessage("");
    try {
      setLoading(true);
      const data = await api.setElectionStatus(nextOpen);
      setElectionStatus(data);
      setMessage(nextOpen ? "Voting site opened." : "Voting site closed.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    link.target = "_blank";
    document.body.appendChild(link);
    try {
      link.click();
    } catch {
      window.open(url, "_blank");
    }
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function handleTemplateDownload() {
    const rows = [
      {
        post: "Who will be the next president 2027",
        name: "Bola-Ahmed Tinubu",
        tagline: "Example tagline",
        image_url: "https://example.com/image.jpg",
        eligible_level: "",
        display_order: 1,
      },
    ];
    const csv = Papa.unparse(rows, { header: true });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, "candidate-import-template.csv");
  }

  function openImport() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage("");
    setImportName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data
            .map((row) => ({
              post: String(row.post || row.title || "").trim(),
              name: String(row.name || "").trim(),
              tagline: String(row.tagline || "").trim(),
              image_url: String(row.image_url || row.image || "").trim(),
              eligible_level: String(
                row.eligible_level || row.level || "",
              ).trim(),
              display_order: Number(row.display_order || row.order || 0),
              post_order: Number(row.post_order || row.group_order || 0),
            }))
            .filter((row) => row.post && row.name)
            .map((row) => ({
              ...row,
              post_order: row.post_order || positionRank({ title: row.post }),
            }));

          if (!rows.length) {
            setMessage(
              "The file does not contain any valid post/candidate rows.",
            );
            return;
          }

          setLoading(true);
          await api.resetElection(rows);
          await loadAdminCoreData();
          if (activeTab === "results") await loadResults();
          if (activeTab === "voters") await loadVoters(1);
          setMessage(
            `Imported ${rows.length} candidate rows from ${file.name}.`,
          );
        } catch (err) {
          setMessage(err.message);
        } finally {
          setLoading(false);
          event.target.value = "";
        }
      },
      error: (err) => {
        setMessage(err.message);
        event.target.value = "";
      },
    });
  }

  function downloadChart(postId, title) {
    const container = chartRefs.current[postId];
    const svg = container?.querySelector("svg");
    if (!svg) {
      setMessage("Chart is not ready yet. Refresh results and try again.");
      return;
    }
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    triggerDownload(
      blob,
      `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-results.svg`,
    );
  }

  function downloadVotersCsv() {
    if (!voters.length) {
      setMessage("Load the voted list before downloading it.");
      return;
    }
    const rows = voters.map((voter) => ({
      name: voter.name,
      reg_no: voter.reg_no,
      email: voter.email,
      voted_at: voter.voted_at || "",
    }));
    const blob = new Blob([Papa.unparse(rows, { header: true })], {
      type: "text/csv;charset=utf-8",
    });
    triggerDownload(blob, `voted-voters-page-${votersPage}.csv`);
  }

  function downloadResultsCsv() {
    if (!percentageResults.length) {
      setMessage("Load results before downloading them.");
      return;
    }
    const rows = percentageResults.flatMap((post) =>
      post.candidates.map((candidate) => ({
        post: post.title,
        candidate: candidate.name,
        votes: candidate.votes,
        percentage: formatPercent(candidate.percentage),
      })),
    );
    const blob = new Blob([Papa.unparse(rows, { header: true })], {
      type: "text/csv;charset=utf-8",
    });
    triggerDownload(blob, "election-results.csv");
  }

  const totalVotes = useMemo(
    () =>
      results.reduce(
        (sum, post) =>
          sum +
          post.candidates.reduce(
            (inner, candidate) => inner + candidate.votes,
            0,
          ),
        0,
      ),
    [results],
  );

  const percentageResults = useMemo(
    () =>
      results.map((post) => {
        const postTotal = post.candidates.reduce(
          (sum, candidate) => sum + candidate.votes,
          0,
        );
        return {
          ...post,
          totalVotes: postTotal,
          candidates: post.candidates.map((candidate) => ({
            ...candidate,
            percentage: postTotal ? (candidate.votes / postTotal) * 100 : 0,
          })),
        };
      }),
    [results],
  );

  if (!authed) {
    return (
      <div
        className="login-page"
        style={{ backgroundImage: `url(${welcome})` }}
      >
        <div className="page-scrim">
          <form className="login-panel compact" onSubmit={login}>
            <Lock size={34} />
            <h1>Admin</h1>
            <p>NACOS UNN election control</p>
            <label>
              <span>Password</span>
              <div className="field">
                <Lock size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Admin password"
                />
              </div>
            </label>
            {message && <p className="error-text">{message}</p>}
            <button className="primary-button" disabled={loading}>
              {loading ? "Checking..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page" style={{ backgroundImage: `url(${welcome})` }}>
      <div className="admin-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">NACOS UNN</p>
            <h1>Admin Dashboard</h1>
            <p>
              {posts.length} posts · {candidates.length} candidates ·{" "}
              {totalVotes} votes
            </p>
          </div>
          <div className="topbar-actions">
            <span
              className={`status-pill ${electionStatus.votingOpen ? "open" : "closed"}`}
            >
              {electionStatus.votingOpen ? "Voting Open" : "Voting Closed"}
            </span>
            <button
              className="icon-button"
              onClick={refreshAdminView}
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        <nav className="tabs">
          <button
            className={activeTab === "setup" ? "active" : ""}
            onClick={() => setActiveTab("setup")}
          >
            <Vote size={16} /> Setup
          </button>
          <button
            className={activeTab === "voters" ? "active" : ""}
            onClick={() => setActiveTab("voters")}
          >
            <Users size={16} /> Voted
          </button>
          <button
            className={activeTab === "results" ? "active" : ""}
            onClick={() => setActiveTab("results")}
          >
            <Download size={16} /> Results
          </button>
        </nav>

        {message && <p className="admin-message">{message}</p>}

        {activeTab === "setup" && (
          <div className="admin-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Election Control</h2>
                  <p className="panel-note">
                    {electionStatus.votingOpen
                      ? "Voters can request OTPs and submit ballots."
                      : "Voters cannot request OTPs or submit ballots."}
                  </p>
                </div>
                <span
                  className={`status-pill ${electionStatus.votingOpen ? "open" : "closed"}`}
                >
                  {electionStatus.votingOpen ? "Open" : "Closed"}
                </span>
              </div>
              <div className="control-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => toggleVoting(true)}
                  disabled={loading || electionStatus.votingOpen}
                >
                  <PlayCircle size={16} /> Start Voting
                </button>
                <button
                  className="mini-button danger"
                  type="button"
                  onClick={() => toggleVoting(false)}
                  disabled={loading || !electionStatus.votingOpen}
                >
                  <PauseCircle size={16} /> Stop Voting
                </button>
                <button
                  className="mini-button danger"
                  type="button"
                  onClick={resetVotes}
                  disabled={loading}
                >
                  Reset Votes
                </button>
              </div>
              {electionStatus.updatedAt ? (
                <p className="panel-note">
                  Last changed{" "}
                  {new Date(electionStatus.updatedAt).toLocaleString()}
                </p>
              ) : null}
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>Posts</h2>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    className="mini-button"
                    type="button"
                    onClick={handleTemplateDownload}
                  >
                    Download Template
                  </button>
                  <button
                    className="mini-button"
                    type="button"
                    onClick={openImport}
                  >
                    Import CSV
                  </button>
                  <button
                    className="mini-button danger"
                    type="button"
                    onClick={resetElection}
                  >
                    Reset Election
                  </button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={handleImportFile}
              />
              {importName && (
                <p className="admin-message">Selected file: {importName}</p>
              )}
              <form className="admin-form" onSubmit={savePost}>
                <input
                  value={postForm.title}
                  onChange={(event) =>
                    setPostForm({ ...postForm, title: event.target.value })
                  }
                  placeholder="Post title"
                />
                <select
                  value={postForm.eligible_level || ""}
                  onChange={(event) =>
                    setPostForm({
                      ...postForm,
                      eligible_level: event.target.value,
                    })
                  }
                >
                  <option value="">All levels can vote</option>
                  <option value="200L">200L only</option>
                  <option value="300L">300L only</option>
                  <option value="400L">400L only</option>
                  <option value="500L">500L only</option>
                </select>
                <input
                  type="number"
                  value={postForm.display_order}
                  onChange={(event) =>
                    setPostForm({
                      ...postForm,
                      display_order: event.target.value,
                    })
                  }
                  placeholder="Order"
                />
                <button className="primary-button" disabled={loading}>
                  <Save size={16} /> Save Post
                </button>
              </form>
              <div className="table-list">
                {posts.map((post) => (
                  <div className="table-row" key={post.id}>
                    <span>
                      {post.title}
                      {post.eligible_level ? ` · ${post.eligible_level}` : ""}
                    </span>
                    <div>
                      <button
                        className="mini-button"
                        onClick={() => setPostForm(post)}
                      >
                        Edit
                      </button>
                      <button
                        className="mini-button danger"
                        onClick={() => removePost(post.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>Candidates</h2>
              <form className="admin-form" onSubmit={saveCandidate}>
                <select
                  value={candidateForm.post_id}
                  onChange={(event) =>
                    setCandidateForm({
                      ...candidateForm,
                      post_id: event.target.value,
                    })
                  }
                >
                  <option value="">Select post</option>
                  {posts.map((post) => (
                    <option value={post.id} key={post.id}>
                      {post.title}
                    </option>
                  ))}
                </select>
                <input
                  value={candidateForm.name}
                  onChange={(event) =>
                    setCandidateForm({
                      ...candidateForm,
                      name: event.target.value,
                    })
                  }
                  placeholder="Candidate name"
                />
                <input
                  value={candidateForm.tagline}
                  onChange={(event) =>
                    setCandidateForm({
                      ...candidateForm,
                      tagline: event.target.value,
                    })
                  }
                  placeholder="Tagline or department"
                />
                <input
                  value={candidateForm.image_url}
                  onChange={(event) =>
                    setCandidateForm({
                      ...candidateForm,
                      image_url: event.target.value,
                    })
                  }
                  placeholder="Image URL"
                />
                <button className="primary-button" disabled={loading}>
                  <Plus size={16} /> Save Candidate
                </button>
              </form>
              <div className="table-list">
                {candidates.map((candidate) => (
                  <div className="table-row" key={candidate.id}>
                    <span>{candidate.name}</span>
                    <div>
                      <button
                        className="mini-button"
                        onClick={() => setCandidateForm(candidate)}
                      >
                        Edit
                      </button>
                      <button
                        className="mini-button danger"
                        onClick={() => removeCandidate(candidate.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === "voters" && (
          <section className="panel">
            <div className="panel-head">
              <h2>People Who Voted</h2>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="mini-button"
                  type="button"
                  onClick={() => loadVoters(1)}
                  disabled={votersLoading}
                >
                  Refresh
                </button>
                <button
                  className="mini-button"
                  type="button"
                  onClick={downloadVotersCsv}
                  disabled={votersLoading}
                >
                  <Download size={14} /> Download CSV
                </button>
              </div>
            </div>
            {votersLoading ? (
              <p className="admin-message">Loading voters...</p>
            ) : null}
            <div className="voter-table">
              {voters.map((voter) => (
                <div className="voter-row" key={voter.reg_no}>
                  <strong>{voter.name}</strong>
                  <span>{voter.reg_no}</span>
                  <span>{voter.email}</span>
                  <span>
                    {voter.voted_at
                      ? new Date(voter.voted_at).toLocaleString()
                      : ""}
                  </span>
                </div>
              ))}
            </div>
            <div className="panel-head" style={{ marginTop: "12px" }}>
              <button
                className="mini-button"
                type="button"
                onClick={() => loadVoters(Math.max(1, votersPage - 1))}
                disabled={votersLoading || votersPage === 1}
              >
                Previous
              </button>
              <span>Page {votersPage}</span>
              <button
                className="mini-button"
                type="button"
                onClick={() => loadVoters(votersPage + 1)}
                disabled={votersLoading || !votersHasNext}
              >
                Next
              </button>
            </div>
          </section>
        )}

        {activeTab === "results" && (
          <>
            {resultsLoading ? (
              <p className="admin-message">Loading results...</p>
            ) : null}
            {resultsLoadedAt ? (
              <p className="admin-message">
                Results loaded {new Date(resultsLoadedAt).toLocaleString()}
              </p>
            ) : null}
            <div className="panel-head" style={{ marginBottom: "12px" }}>
              <button
                className="mini-button"
                type="button"
                onClick={loadResults}
                disabled={resultsLoading}
              >
                Refresh Results
              </button>
              <button
                className="mini-button"
                type="button"
                onClick={downloadResultsCsv}
                disabled={resultsLoading}
              >
                <Download size={14} /> Download CSV
              </button>
            </div>
            <div className="results-grid">
              {percentageResults.map((post) => (
                <section className="panel" key={post.id}>
                  <div className="panel-head">
                    <h2>{post.title}</h2>
                    <button
                      className="mini-button"
                      type="button"
                      onClick={() => downloadChart(post.id, post.title)}
                    >
                      <Download size={14} /> Download
                    </button>
                  </div>
                  <p className="admin-message">
                    Total votes: {post.totalVotes}
                  </p>
                  <div
                    className="chart-box"
                    ref={(node) => (chartRefs.current[post.id] = node)}
                  >
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={post.candidates}
                          dataKey="percentage"
                          nameKey="name"
                          outerRadius={90}
                          label={({ percentage }) => formatPercent(percentage)}
                        >
                          {post.candidates.map((candidate, index) => (
                            <Cell
                              key={candidate.id}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, _name, item) => [
                            `${formatPercent(Number(value))} (${item.payload.votes} votes)`,
                            item.payload.name,
                          ]}
                        />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="result-breakdown">
                    {post.candidates.map((candidate, index) => (
                      <div className="result-breakdown-row" key={candidate.id}>
                        <span
                          className="result-color"
                          style={{ background: COLORS[index % COLORS.length] }}
                        />
                        <span>{candidate.name}</span>
                        <strong>{formatPercent(candidate.percentage)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
