import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import "./UNNDemoAdmin.css";

const EMPTY_POST = { id: "", title: "", eligible_level: "", display_order: 0, is_active: true };
const EMPTY_CANDIDATE = { id: "", post_id: "", name: "", tagline: "", image_url: "", display_order: 0, is_active: true };

function messageFrom(error, fallback) {
  return error?.message || fallback;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function UNNDemoAdmin() {
  const [tab, setTab] = useState("Overview");
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(() =>
    Boolean(localStorage.getItem("nacosUnnAdminToken") || sessionStorage.getItem("nacosUnnAdminToken"))
  );
  const [posts, setPosts] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [voters, setVoters] = useState([]);
  const [votedVoters, setVotedVoters] = useState([]);
  const [results, setResults] = useState([]);
  const [electionStatus, setElectionStatus] = useState(null);
  const [postForm, setPostForm] = useState(EMPTY_POST);
  const [candidateForm, setCandidateForm] = useState(EMPTY_CANDIDATE);
  const [voterForm, setVoterForm] = useState({ reg_no: "", name: "", email: "", level: "" });
  const [setupCodeFor, setSetupCodeFor] = useState("");
  const [generatedSetupCode, setGeneratedSetupCode] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [votersLoading, setVotersLoading] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [candidateImport, setCandidateImport] = useState({
    fileName: "",
    rows: [],
    errors: [],
  });
  const candidateFileInputRef = useRef(null);

  const loadCore = useCallback(async () => {
    const [postData, candidateData, statusData] = await Promise.all([
      api.adminPosts(),
      api.adminCandidates(),
      api.electionStatus(),
    ]);
    const nextPosts = Array.isArray(postData?.posts) ? postData.posts : [];
    const nextCandidates = Array.isArray(candidateData?.candidates) ? candidateData.candidates : [];
    setPosts(nextPosts);
    setCandidates(nextCandidates);
    setElectionStatus(statusData || null);
    setCandidateForm((current) => ({
      ...current,
      post_id: current.post_id || nextPosts[0]?.id || "",
    }));
  }, []);

  const loadVoters = useCallback(async () => {
    setVotersLoading(true);
    try {
      const [allData, votedData] = await Promise.all([
        api.adminVoters(),
        api.votersVoted(1, 100),
      ]);
      setVoters(Array.isArray(allData?.voters) ? allData.voters : []);
      setVotedVoters(Array.isArray(votedData?.voters) ? votedData.voters : []);
    } finally {
      setVotersLoading(false);
    }
  }, []);

  const loadResults = useCallback(async () => {
    setResultsLoading(true);
    try {
      const data = await api.results();
      setResults(Array.isArray(data?.posts) ? data.posts : []);
    } finally {
      setResultsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        await api.adminSession();
        if (!cancelled) {
          setAuthed(true);
          await loadCore();
        }
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 401 || error?.status === 403) {
          localStorage.removeItem("nacosUnnAdminToken");
          sessionStorage.removeItem("nacosUnnAdminToken");
          setAuthed(false);
          return;
        }
        // Keep the gate visible but do not invent a successful session.
        setAuthed(false);
      }
    }
    checkSession();
    return () => { cancelled = true; };
  }, [loadCore]);

  useEffect(() => {
    if (!authed) return;
    if (tab === "Voters") loadVoters().catch((error) => setNotice(messageFrom(error, "Unable to load voters.")));
    if (tab === "Election & Results") loadResults().catch((error) => setNotice(messageFrom(error, "Unable to load results.")));
  }, [authed, tab, loadVoters, loadResults]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    try {
      const data = await api.adminLogin(password);
      if (!data?.token && !localStorage.getItem("nacosUnnAdminToken") && !sessionStorage.getItem("nacosUnnAdminToken")) {
        throw new Error("Login did not return an admin session.");
      }
      sessionStorage.removeItem("nacosUnnVoterToken");
      setAuthed(true);
      await loadCore();
      setNotice("Admin session authenticated.");
    } catch (error) {
      setNotice(messageFrom(error, "Admin login failed."));
    } finally {
      setLoading(false);
    }
  }

  async function refreshAll() {
    setLoading(true);
    setNotice("");
    try {
      await loadCore();
      if (tab === "Voters") await loadVoters();
      if (tab === "Election & Results") await loadResults();
      setNotice("Dashboard data refreshed from the server.");
    } catch (error) {
      setNotice(messageFrom(error, "Unable to refresh dashboard data."));
    } finally {
      setLoading(false);
    }
  }

  async function savePost(event) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    try {
      await api.savePost({
        ...postForm,
        title: postForm.title.trim(),
        display_order: Number(postForm.display_order || 0),
      });
      setPostForm(EMPTY_POST);
      await loadCore();
      setNotice("Post saved.");
    } catch (error) {
      setNotice(messageFrom(error, "Unable to save post."));
    } finally {
      setLoading(false);
    }
  }

  async function deletePost(id) {
    if (!window.confirm("Delete this post? This may affect its candidates and election setup.")) return;
    setLoading(true);
    setNotice("");
    try {
      await api.deletePost(id);
      setPostForm(EMPTY_POST);
      await loadCore();
      setNotice("Post deleted.");
    } catch (error) {
      setNotice(messageFrom(error, "Unable to delete post."));
    } finally {
      setLoading(false);
    }
  }

  async function saveCandidate(event) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    try {
      await api.saveCandidate({
        ...candidateForm,
        name: candidateForm.name.trim(),
        display_order: Number(candidateForm.display_order || 0),
      });
      setCandidateForm({ ...EMPTY_CANDIDATE, post_id: posts[0]?.id || "" });
      await loadCore();
      setNotice("Candidate saved.");
    } catch (error) {
      setNotice(messageFrom(error, "Unable to save candidate."));
    } finally {
      setLoading(false);
    }
  }

  async function downloadCandidateTemplate() {
    const XLSX = await import("@e965/xlsx");
    const workbook = XLSX.utils.book_new();
    const candidatesSheet = XLSX.utils.aoa_to_sheet([
      ["Full Name", "Position", "Tagline", "Image URL"],
      [
        "DEMO ONLY - Alex Example",
        posts[0]?.title || "Position title from admin",
        "Demonstration data - delete this row before importing",
        "",
      ],
    ]);
    const instructionsSheet = XLSX.utils.aoa_to_sheet([
      ["Candidate Excel Import Instructions"],
      ["1. Enter one candidate per row in the Candidates sheet."],
      ["2. Full Name and Position are required."],
      ["3. Position must match an existing admin position name."],
      ["4. Tagline and Image URL are optional."],
      ["5. Delete the DEMO ONLY example row before importing."],
      ["6. Save the workbook as an Excel .xlsx file."],
    ]);
    XLSX.utils.book_append_sheet(workbook, candidatesSheet, "Candidates");
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");
    const content = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([content], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "candidate-import-template.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function readCandidateWorkbook(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setNotice("");
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setCandidateImport({
        fileName: file.name,
        rows: [],
        errors: [{ row: null, message: "Choose a Microsoft Excel .xlsx file." }],
      });
      return;
    }

    try {
      const content = await file.arrayBuffer();
      const signature = new Uint8Array(content, 0, Math.min(content.byteLength, 2));
      if (signature.length !== 2 || signature[0] !== 0x50 || signature[1] !== 0x4b) {
        throw new Error("Not an Excel workbook.");
      }
      const XLSX = await import("@e965/xlsx");
      const workbook = XLSX.read(content, { type: "array" });
      const worksheet = workbook.Sheets.Candidates;
      if (!worksheet) {
        setCandidateImport({
          fileName: file.name,
          rows: [],
          errors: [{
            row: null,
            message: 'The workbook must contain a worksheet named "Candidates".',
          }],
        });
        return;
      }

      const sheetRows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: true,
        defval: "",
        blankrows: true,
      });
      const headers = new Map();
      const errors = [];
      const allowedHeaders = new Set(["full name", "position", "tagline", "image url"]);
      (sheetRows[0] || []).forEach((value, index) => {
        if (value === "") return;
        if (typeof value !== "string") {
          errors.push({ row: 1, message: "Column headers must be text." });
          return;
        }
        const header = value.trim().toLowerCase();
        if (!allowedHeaders.has(header)) {
          errors.push({ row: 1, message: `Unexpected column "${value}".` });
        } else if (headers.has(header)) {
          errors.push({ row: 1, message: `Column "${value}" appears more than once.` });
        } else {
          headers.set(header, index);
        }
      });
      ["full name", "position"].forEach((header) => {
        if (!headers.has(header)) {
          errors.push({
            row: 1,
            message: `Required column "${header === "full name" ? "Full Name" : "Position"}" is missing.`,
          });
        }
      });
      if (errors.length) {
        setCandidateImport({ fileName: file.name, rows: [], errors });
        return;
      }

      const normalize = (value) => String(value || "").trim().toLowerCase();
      const postsByName = new Map();
      posts.forEach((post) => {
        const key = normalize(post.title);
        postsByName.set(key, [...(postsByName.get(key) || []), post]);
      });
      const existing = new Set(
        candidates.map((candidate) => `${candidate.post_id}:${normalize(candidate.name)}`),
      );
      const seen = new Set();
      const rows = [];
      sheetRows.slice(1).forEach((values, index) => {
        const row = index + 2;
        if (!values.some((value) => value !== "" && value !== null && value !== undefined)) return;
        const readText = (header, label) => {
          const value = values[headers.get(header)] ?? "";
          if (value === "") return "";
          if (typeof value !== "string") {
            errors.push({ row, message: `${label} must contain text.` });
            return "";
          }
          return value.trim();
        };
        const name = readText("full name", "Full Name");
        const position = readText("position", "Position");
        const tagline = headers.has("tagline") ? readText("tagline", "Tagline") : "";
        const image_url = headers.has("image url") ? readText("image url", "Image URL") : "";
        if (!name) errors.push({ row, message: "Full Name is required." });
        else if (name.toUpperCase().startsWith("DEMO ONLY -")) {
          errors.push({ row, message: "Remove the demonstration example row before importing." });
        }
        if (!position) errors.push({ row, message: "Position is required." });
        const matchingPosts = postsByName.get(normalize(position)) || [];
        if (position && matchingPosts.length === 0) {
          errors.push({ row, message: `Position "${position}" does not exist.` });
        } else if (matchingPosts.length > 1) {
          errors.push({ row, message: `Position "${position}" is ambiguous.` });
        }
        const post = matchingPosts[0];
        const key = post ? `${post.id}:${normalize(name)}` : "";
        if (name && post && existing.has(key)) {
          errors.push({ row, message: `${name} already exists for ${post.title}.` });
        } else if (name && post && seen.has(key)) {
          errors.push({ row, message: `${name} appears more than once for ${post.title} in this workbook.` });
        }
        if (key) seen.add(key);
        rows.push({ row, name, position, tagline, image_url });
      });
      if (!rows.length) errors.push({ row: null, message: "The Candidates worksheet contains no candidate rows." });
      setCandidateImport({ fileName: file.name, rows, errors });
    } catch {
      setCandidateImport({
        fileName: file.name,
        rows: [],
        errors: [{ row: null, message: "The selected file is not a valid .xlsx workbook." }],
      });
    }
  }

  async function confirmCandidateImport() {
    if (!candidateImport.rows.length || candidateImport.errors.length) return;
    if (!window.confirm(`Import ${candidateImport.rows.length} candidates from ${candidateImport.fileName}?`)) return;
    setLoading(true);
    setNotice("");
    try {
      const result = await api.importCandidates(candidateImport.rows);
      await loadCore();
      setCandidateImport({ fileName: "", rows: [], errors: [] });
      setNotice(`Imported ${result.imported} candidates.`);
    } catch (error) {
      if (error.data?.errors) {
        setCandidateImport((current) => ({ ...current, errors: error.data.errors }));
      }
      setNotice(messageFrom(error, "Unable to import candidates."));
    } finally {
      setLoading(false);
    }
  }

  async function deleteCandidate(id) {
    if (!window.confirm("Delete this candidate?")) return;
    setLoading(true);
    setNotice("");
    try {
      await api.deleteCandidate(id);
      setCandidateForm({ ...EMPTY_CANDIDATE, post_id: posts[0]?.id || "" });
      await loadCore();
      setNotice("Candidate deleted.");
    } catch (error) {
      setNotice(messageFrom(error, "Unable to delete candidate."));
    } finally {
      setLoading(false);
    }
  }

  async function registerVoter(event) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    setGeneratedSetupCode("");
    try {
      await api.registerVoter({
        reg_no: voterForm.reg_no.trim().toUpperCase(),
        name: voterForm.name.trim(),
        email: voterForm.email.trim(),
        level: voterForm.level,
      });
      setVoterForm({ reg_no: "", name: "", email: "", level: "" });
      await loadVoters();
      setNotice("Voter registered on the server.");
    } catch (error) {
      setNotice(messageFrom(error, "Unable to register voter."));
    } finally {
      setLoading(false);
    }
  }

  async function generateCode(event) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    setGeneratedSetupCode("");
    try {
      const data = await api.generateSetupCode(setupCodeFor.trim().toUpperCase());
      const code = data?.setup_code ?? data?.setupCode ?? data?.code ?? "";
      setGeneratedSetupCode(String(code));
      setNotice(code ? "Setup code generated. Share it securely with the intended voter." : "The server responded, but did not return a setup code field.");
    } catch (error) {
      setNotice(messageFrom(error, "Unable to generate setup code."));
    } finally {
      setLoading(false);
    }
  }

  async function toggleVoting(nextOpen) {
    setLoading(true);
    setNotice("");
    try {
      const data = await api.setElectionStatus(nextOpen);
      setElectionStatus(data);
      setNotice(nextOpen ? "Voting has been opened." : "Voting has been closed.");
    } catch (error) {
      setNotice(messageFrom(error, "Unable to update election status."));
    } finally {
      setLoading(false);
    }
  }

  async function resetVotes() {
    if (!window.confirm("Reset all submitted votes and OTP state? This action cannot be undone.")) return;
    setLoading(true);
    setNotice("");
    try {
      const data = await api.resetVotes();
      setVotedVoters([]);
      setResults([]);
      setNotice(data?.message || "Vote reset request completed.");
    } catch (error) {
      setNotice(messageFrom(error, "Unable to reset votes."));
    } finally {
      setLoading(false);
    }
  }

  async function resetElection() {
    if (!window.confirm("Reset the election setup? This removes posts, candidates, and votes. This action cannot be undone.")) return;
    setLoading(true);
    setNotice("");
    try {
      await api.resetElection();
      setPostForm(EMPTY_POST);
      setCandidateForm(EMPTY_CANDIDATE);
      await loadCore();
      setResults([]);
      setNotice("Election reset completed.");
    } catch (error) {
      setNotice(messageFrom(error, "Unable to reset election."));
    } finally {
      setLoading(false);
    }
  }

  const activeCandidates = candidates.filter((candidate) => candidate.is_active !== false);
  const filteredVoters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return voters.filter((voter) =>
      [voter.name, voter.reg_no, voter.email, voter.level].some((value) => String(value || "").toLowerCase().includes(q))
    );
  }, [voters, search]);
  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const post = posts.find((item) => String(item.id) === String(candidate.post_id));
      return [candidate.name, candidate.tagline, post?.title].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [candidates, posts, search]);
  const totalVotes = results.reduce((sum, post) => sum + (post.candidates || []).reduce((inner, candidate) => inner + Number(candidate.votes || 0), 0), 0);
  const votingOpen = Boolean(electionStatus?.votingOpen);

  if (!authed) {
    return (
      <div className="unn-admin">
        <main className="unn-main" style={{ maxWidth: 520, margin: "auto", padding: 24 }}>
          <section className="unn-panel">
            <div className="unn-brand">
              <div className="unn-brand-mark">N</div>
              <div><strong>NACOS UNN</strong><span>Secure election administration</span></div>
            </div>
            <h2>Admin access</h2>
            <p className="unn-muted">Sign in to manage the NACOS UNN election.</p>
            <form className="unn-form" onSubmit={handleLogin}>
              <label>Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
              <button className="unn-primary-button" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
            </form>
            {notice && <p className="unn-notice" role="status">{notice}</p>}
          </section>
        </main>
      </div>
    );
  }

  const navItems = ["Overview", "Voters", "Candidates", "Election & Results"];

  return (
    <div className="unn-admin">
      <aside className="unn-sidebar">
        <div className="unn-brand">
          <div className="unn-brand-mark">N</div>
          <div><strong>NACOS UNN</strong><span>Election administration</span></div>
        </div>
        <div className="unn-sidebar-label">WORKSPACE</div>
        <nav className="unn-nav" aria-label="Admin sections">
          {navItems.map((item) => (
            <button key={item} className={tab === item ? "selected" : ""} onClick={() => { setTab(item); setSearch(""); setNotice(""); }}>
              <span className="unn-nav-dot" />{item}
            </button>
          ))}
        </nav>
        <div className="unn-sidebar-bottom">
          <span className="unn-demo-badge">LIVE DATA</span>
          <p>Records shown here are loaded from the NACOS server. Blockchain verification is not asserted unless confirmed by an available source.</p>
        </div>
      </aside>

      <main className="unn-main">
        <header className="unn-topbar">
          <div>
            <div className="unn-breadcrumb">NACOS UNN / Admin</div>
            <h1>{tab}</h1>
            <p className="unn-muted">{posts.length} posts · {candidates.length} candidates · {totalVotes} counted votes</p>
          </div>
          <button className="unn-secondary-button" onClick={refreshAll} disabled={loading}>Refresh data</button>
        </header>

        <div className="unn-content">
          {notice && <div className="unn-notice" role="status">{notice}</div>}

          {tab === "Overview" && <>
            <section className="unn-welcome">
              <div>
                <span className="unn-eyebrow">SECURE ADMINISTRATION CONSOLE</span>
                <h2>Election management, made verifiable.</h2>
                <p>Manage the live NACOS election configuration and inspect the data returned by the server. Blockchain verification is reported only when the application can verify it.</p>
              </div>
              <div className="unn-welcome-icon">✓</div>
            </section>
            <section className="unn-stat-grid">
              <article className="unn-stat-card"><span>Registered voters</span><strong>{voters.length || "—"}</strong><small>{voters.length ? "Server records loaded" : "Open Voters to load records"}</small></article>
              <article className="unn-stat-card"><span>Candidates</span><strong>{candidates.length}</strong><small>{activeCandidates.length} not marked inactive</small></article>
              <article className="unn-stat-card"><span>Election posts</span><strong>{posts.length}</strong><small>Loaded from the server</small></article>
              <article className="unn-stat-card"><span>Voting status</span><strong className={votingOpen ? "" : "unn-pending"} style={{ fontSize: 18 }}>{electionStatus ? (votingOpen ? "Open" : "Closed") : "Unavailable"}</strong><small>{electionStatus?.updatedAt ? `Updated ${formatDate(electionStatus.updatedAt)}` : "Server status; blockchain status not inferred"}</small></article>
            </section>
            <section className="unn-panel">
              <div className="unn-panel-heading"><div><h3>Election controls</h3><p>These controls update the server's election status.</p></div></div>
              <div className="unn-quick-actions">
                <button disabled={loading || votingOpen} onClick={() => toggleVoting(true)}>Open voting</button>
                <button disabled={loading || !votingOpen} onClick={() => toggleVoting(false)}>Close voting</button>
                <button disabled={loading} onClick={() => setTab("Voters")}>Manage voters</button>
                <button disabled={loading} onClick={() => setTab("Election & Results")}>View results</button>
              </div>
            </section>
            <section className="unn-panel">
              <div className="unn-panel-heading"><div><h3>Configured posts</h3><p>Candidate counts are calculated from live server data.</p></div></div>
              <div className="unn-office-list">
                {posts.map((post) => <div className="unn-office-row" key={post.id}><span>{post.title}</span><strong>{candidates.filter((candidate) => String(candidate.post_id) === String(post.id) && candidate.is_active !== false).length} active candidates</strong></div>)}
                {!posts.length && <p className="unn-muted">No election posts have been configured yet.</p>}
              </div>
            </section>
          </>}

          {tab === "Voters" && <>
            <section className="unn-panel">
              <div className="unn-panel-heading"><div><h3>Register a voter</h3><p>Registration is submitted to the NACOS backend.</p></div></div>
              <form className="unn-form" onSubmit={registerVoter}>
                <label>Registration number<input value={voterForm.reg_no} onChange={(event) => setVoterForm({ ...voterForm, reg_no: event.target.value })} required /></label>
                <label>Full name<input value={voterForm.name} onChange={(event) => setVoterForm({ ...voterForm, name: event.target.value })} required /></label>
                <label>Email<input type="email" value={voterForm.email} onChange={(event) => setVoterForm({ ...voterForm, email: event.target.value })} required /></label>
                <label>Level<select value={voterForm.level} onChange={(event) => setVoterForm({ ...voterForm, level: event.target.value })} required><option value="">Select level</option>{["100L", "200L", "300L", "400L", "500L"].map((level) => <option key={level}>{level}</option>)}</select></label>
                <button className="unn-primary-button" type="submit" disabled={loading}>Register voter</button>
              </form>
            </section>
            <section className="unn-panel">
              <div className="unn-panel-heading"><div><h3>Voter directory</h3><p>{voters.length} server records</p></div><input className="unn-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search voters…" /></div>
              {votersLoading && <p className="unn-muted">Loading voter records…</p>}
              <div className="unn-table-wrap"><table className="unn-table"><thead><tr><th>Registration no.</th><th>Name</th><th>Email</th><th>Level</th><th>Voting status</th></tr></thead><tbody>
                {filteredVoters.map((voter) => <tr key={voter.reg_no || voter.id}><td>{voter.reg_no || "—"}</td><td>{voter.name || "—"}</td><td>{voter.email || "—"}</td><td>{voter.level || "—"}</td><td><span className={`unn-status ${voter.voted ? "active" : "inactive"}`}>{voter.voted ? "Voted" : "Not marked as voted"}</span></td></tr>)}
                {!votersLoading && !filteredVoters.length && <tr><td colSpan="5">No voter records found.</td></tr>}
              </tbody></table></div>
            </section>
            <section className="unn-panel">
              <div className="unn-panel-heading"><div><h3>Generate voter setup code</h3><p>Codes are generated by the server. Share them privately.</p></div></div>
              <form className="unn-form" onSubmit={generateCode}>
                <label>Registration number<input value={setupCodeFor} onChange={(event) => setSetupCodeFor(event.target.value)} required /></label>
                <button className="unn-primary-button" disabled={loading}>Generate setup code</button>
              </form>
              {generatedSetupCode && <p className="unn-notice">Setup code: <strong>{generatedSetupCode}</strong></p>}
              <div className="unn-panel-heading" style={{ marginTop: 24 }}><div><h3>Voters recorded as having voted</h3><p>Returned by the server's voted-voter endpoint.</p></div></div>
              <div className="unn-table-wrap"><table className="unn-table"><thead><tr><th>Name</th><th>Registration no.</th><th>Email</th><th>Voted at</th></tr></thead><tbody>
                {votedVoters.map((voter) => <tr key={voter.reg_no}><td>{voter.name || "—"}</td><td>{voter.reg_no || "—"}</td><td>{voter.email || "—"}</td><td>{formatDate(voter.voted_at)}</td></tr>)}
                {!votedVoters.length && <tr><td colSpan="4">No voted-voter records loaded. Refresh this section to check the server.</td></tr>}
              </tbody></table></div>
            </section>
          </>}

          {tab === "Candidates" && <>
            <section className="unn-panel">
              <div className="unn-panel-heading"><div><h3>{candidateForm.id ? "Edit candidate" : "Add candidate"}</h3><p>Candidate changes are saved to the NACOS backend.</p></div></div>
              <form className="unn-form" onSubmit={saveCandidate}>
                <label>Candidate name<input value={candidateForm.name} onChange={(event) => setCandidateForm({ ...candidateForm, name: event.target.value })} required /></label>
                <label>Post<select value={candidateForm.post_id || ""} onChange={(event) => setCandidateForm({ ...candidateForm, post_id: event.target.value })} required><option value="">Select post</option>{posts.map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}</select></label>
                <label>Tagline<input value={candidateForm.tagline || ""} onChange={(event) => setCandidateForm({ ...candidateForm, tagline: event.target.value })} /></label>
                <label>Image URL<input value={candidateForm.image_url || ""} onChange={(event) => setCandidateForm({ ...candidateForm, image_url: event.target.value })} /></label>
                <label>Display order<input type="number" value={candidateForm.display_order ?? 0} onChange={(event) => setCandidateForm({ ...candidateForm, display_order: event.target.value })} /></label>
                <button className="unn-primary-button" type="submit" disabled={loading || !posts.length}>Save candidate</button>
                {candidateForm.id && <button className="unn-secondary-button" type="button" onClick={() => setCandidateForm({ ...EMPTY_CANDIDATE, post_id: posts[0]?.id || "" })}>Cancel edit</button>}
              </form>
            </section>
            <section className="unn-panel">
              <div className="unn-panel-heading">
                <div>
                  <h3>Import Candidates from Excel</h3>
                  <p>Upload an .xlsx workbook, review every row, and confirm before importing.</p>
                </div>
                <button className="unn-secondary-button" type="button" onClick={downloadCandidateTemplate}>
                  Download .xlsx template
                </button>
              </div>
              <input
                ref={candidateFileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={readCandidateWorkbook}
                hidden
              />
              <button
                className="unn-primary-button"
                type="button"
                onClick={() => candidateFileInputRef.current?.click()}
                disabled={loading}
              >
                Import Candidates from Excel
              </button>
              {candidateImport.fileName && <p className="unn-muted">Selected file: {candidateImport.fileName}</p>}
              {candidateImport.errors.length > 0 && (
                <ul className="unn-import-errors" role="alert">
                  {candidateImport.errors.map((error, index) => (
                    <li key={`${error.row ?? "file"}-${index}`}>
                      {error.row ? `Row ${error.row}: ` : ""}{error.message}
                    </li>
                  ))}
                </ul>
              )}
              {candidateImport.rows.length > 0 && (
                <>
                  <div className="unn-import-preview">
                    {candidateImport.rows.map((candidate) => (
                      <div className="unn-office-row" key={`${candidate.row}-${candidate.name}`}>
                        <span>Row {candidate.row}: {candidate.name || "(missing name)"}</span>
                        <strong>{candidate.position || "(missing position)"}</strong>
                      </div>
                    ))}
                  </div>
                  <button
                    className="unn-primary-button"
                    type="button"
                    onClick={confirmCandidateImport}
                    disabled={loading || candidateImport.errors.length > 0}
                  >
                    {loading ? "Importing…" : `Import ${candidateImport.rows.length} candidates`}
                  </button>
                </>
              )}
            </section>
            <section className="unn-panel">
              <div className="unn-panel-heading"><div><h3>Candidate directory</h3><p>{candidates.length} server records</p></div><input className="unn-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidates…" /></div>
              <div className="unn-candidate-grid">
                {filteredCandidates.map((candidate) => {
                  const post = posts.find((item) => String(item.id) === String(candidate.post_id));
                  return <article className="unn-candidate-card" key={candidate.id}><div className="unn-avatar">{String(candidate.name || "?").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div><div className="unn-candidate-info"><span className="unn-candidate-office">{post?.title || "Unassigned post"}</span><h4>{candidate.name}</h4><p>{candidate.tagline || "No tagline provided."}</p><span className={`unn-status ${candidate.is_active === false ? "inactive" : "active"}`}>{candidate.is_active === false ? "Inactive" : "Active"}</span></div><div><button className="unn-row-button" onClick={() => setCandidateForm(candidate)}>Edit</button><button className="unn-row-button" onClick={() => deleteCandidate(candidate.id)} disabled={loading}>Delete</button></div></article>;
                })}
                {!filteredCandidates.length && <p className="unn-muted">No candidates found in the server data.</p>}
              </div>
            </section>
            <section className="unn-panel">
              <div className="unn-panel-heading"><div><h3>Election posts</h3><p>Manage the real configured posts.</p></div></div>
              <form className="unn-form" onSubmit={savePost}>
                <label>Post title<input value={postForm.title} onChange={(event) => setPostForm({ ...postForm, title: event.target.value })} required /></label>
                <label>Eligible level<select value={postForm.eligible_level || ""} onChange={(event) => setPostForm({ ...postForm, eligible_level: event.target.value })}><option value="">All levels</option>{["200L", "300L", "400L", "500L"].map((level) => <option key={level}>{level}</option>)}</select></label>
                <label>Display order<input type="number" value={postForm.display_order ?? 0} onChange={(event) => setPostForm({ ...postForm, display_order: event.target.value })} /></label>
                <button className="unn-primary-button" disabled={loading}>Save post</button>
                {postForm.id && <button className="unn-secondary-button" type="button" onClick={() => setPostForm(EMPTY_POST)}>Cancel edit</button>}
              </form>
              <div className="unn-office-list">{posts.map((post) => <div className="unn-office-row" key={post.id}><span>{post.title}{post.eligible_level ? ` · ${post.eligible_level}` : ""}</span><div><button className="unn-row-button" onClick={() => setPostForm(post)}>Edit</button><button className="unn-row-button" onClick={() => deletePost(post.id)} disabled={loading}>Delete</button></div></div>)}{!posts.length && <p className="unn-muted">No posts have been configured.</p>}</div>
            </section>
          </>}

          {tab === "Election & Results" && <>
            <section className="unn-panel">
              <div className="unn-panel-heading"><div><h3>Election controls</h3><p>These actions change server state. Confirm before using destructive actions.</p></div><span className={`unn-status ${votingOpen ? "active" : "inactive"}`}>{electionStatus ? (votingOpen ? "Voting open" : "Voting closed") : "Status unavailable"}</span></div>
              <div className="unn-office-list">
                <div className="unn-office-row"><span>Network / contract verification</span><strong>Not exposed by the supplied admin API; not verified here</strong></div>
                <div className="unn-office-row"><span>Server voting status</span><strong>{electionStatus ? (votingOpen ? "Open" : "Closed") : "Unavailable"}</strong></div>
                <div className="unn-office-row"><span>Last status update</span><strong>{formatDate(electionStatus?.updatedAt)}</strong></div>
                <div className="unn-office-row"><span>Posts configured</span><strong>{posts.length}</strong></div>
                <div className="unn-office-row"><span>Candidates configured</span><strong>{candidates.length}</strong></div>
                <div className="unn-office-row"><span>Votes counted in loaded results</span><strong>{totalVotes}</strong></div>
              </div>
              <div className="unn-quick-actions" style={{ marginTop: 20 }}>
                <button disabled={loading || !electionStatus || votingOpen} onClick={() => toggleVoting(true)}>Open voting</button>
                <button disabled={loading || !electionStatus || !votingOpen} onClick={() => toggleVoting(false)}>Close voting</button>
                <button disabled={loading} onClick={resetVotes}>Reset votes</button>
                <button disabled={loading} onClick={resetElection}>Reset entire election</button>
                <button disabled={resultsLoading} onClick={() => loadResults().catch((error) => setNotice(messageFrom(error, "Unable to load results.")))}>Refresh results</button>
              </div>
            </section>
            <section className="unn-panel">
              <div className="unn-panel-heading"><div><h3>Election results</h3><p>Results shown here come from the server response, not sample data.</p></div><span className="unn-muted">{resultsLoading ? "Loading…" : `${results.length} posts`}</span></div>
              {results.map((post) => {
                const total = (post.candidates || []).reduce((sum, candidate) => sum + Number(candidate.votes || 0), 0);
                return <div className="unn-office-list" key={post.id}><div className="unn-office-row"><strong>{post.title}</strong><strong>{total} votes</strong></div>{(post.candidates || []).map((candidate) => <div className="unn-office-row" key={candidate.id}><span>{candidate.name}</span><strong>{Number(candidate.votes || 0)} votes{total ? ` · ${(Number(candidate.votes || 0) / total * 100).toFixed(1)}%` : ""}</strong></div>)}</div>;
              })}
              {!resultsLoading && !results.length && <p className="unn-muted">No results returned. This may mean there are no recorded votes or results are unavailable.</p>}
            </section>
          </>}
        </div>
      </main>
    </div>
  );
}
