import { useEffect, useMemo, useState } from "react";
import "./UNNDemoAdmin.css";

const initialPosts = [
  "President",
  "Vice President",
  "Secretary General",
  "Assistant Secretary General",
  "Financial Secretary",
];

const initialCandidates = [
  { id: 1, name: "Chinedu Okafor", post: "President", manifesto: "Service and accountability", active: true },
  { id: 2, name: "Adaeze Eze", post: "President", manifesto: "A stronger student community", active: true },
  { id: 3, name: "Emeka Nwosu", post: "Vice President", manifesto: "Student engagement", active: true },
  { id: 4, name: "Ifunanya Obi", post: "Vice President", manifesto: "Better communication", active: true },
  { id: 5, name: "Somtochukwu Nnamdi", post: "Secretary General", manifesto: "Transparent records", active: true },
  { id: 6, name: "Chiamaka Umeh", post: "Secretary General", manifesto: "Organised administration", active: true },
  { id: 7, name: "Kelechi Madu", post: "Assistant Secretary General", manifesto: "Efficient support", active: true },
  { id: 8, name: "Oluchi Okeke", post: "Assistant Secretary General", manifesto: "Accessible administration", active: true },
  { id: 9, name: "Obinna Eze", post: "Financial Secretary", manifesto: "Clear financial reporting", active: true },
  { id: 10, name: "Amarachi Onoh", post: "Financial Secretary", manifesto: "Responsible budgeting", active: true },
];

const initialVoters = [
  { id: 1, regNo: "UNN-CS-001", name: "Demo Voter One", level: "200L", active: true },
  { id: 2, regNo: "UNN-CS-002", name: "Demo Voter Two", level: "200L", active: true },
  { id: 3, regNo: "UNN-CS-003", name: "Demo Voter Three", level: "300L", active: true },
  { id: 4, regNo: "UNN-CS-004", name: "Demo Voter Four", level: "400L", active: true },
  { id: 5, regNo: "UNN-CS-005", name: "Demo Voter Five", level: "500L", active: true },
];

function loadDemoData(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

export default function UNNDemoAdmin() {
  const [tab, setTab] = useState("Overview");
  const [posts] = useState(initialPosts);
  const [candidates, setCandidates] = useState(() =>
    loadDemoData("unnDemoCandidates", initialCandidates)
  );
  const [voters, setVoters] = useState(() =>
    loadDemoData("unnDemoVoters", initialVoters)
  );
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  const [voterForm, setVoterForm] = useState({
    regNo: "",
    name: "",
    level: "200L",
  });
  const [candidateForm, setCandidateForm] = useState({
    name: "",
    post: initialPosts[0],
    manifesto: "",
  });

  useEffect(() => {
    localStorage.setItem("unnDemoCandidates", JSON.stringify(candidates));
  }, [candidates]);

  useEffect(() => {
    localStorage.setItem("unnDemoVoters", JSON.stringify(voters));
  }, [voters]);

  const activeVoters = voters.filter((voter) => voter.active).length;
  const activeCandidates = candidates.filter((candidate) => candidate.active).length;

  const filteredVoters = useMemo(() => {
    const query = search.toLowerCase().trim();
    return voters.filter((voter) =>
      `${voter.name} ${voter.regNo} ${voter.level}`.toLowerCase().includes(query)
    );
  }, [voters, search]);

  const filteredCandidates = useMemo(() => {
    const query = search.toLowerCase().trim();
    return candidates.filter((candidate) =>
      `${candidate.name} ${candidate.post} ${candidate.manifesto}`
        .toLowerCase()
        .includes(query)
    );
  }, [candidates, search]);

  function addVoter(event) {
    event.preventDefault();
    setNotice("");

    const regNo = voterForm.regNo.trim().toUpperCase();
    const name = voterForm.name.trim();

    if (!regNo || !name) {
      setNotice("Enter both a voter ID and a name.");
      return;
    }

    if (voters.some((voter) => voter.regNo.toUpperCase() === regNo)) {
      setNotice("That voter ID already exists.");
      return;
    }

    setVoters((current) => [
      ...current,
      {
        id: Date.now(),
        regNo,
        name,
        level: voterForm.level,
        active: true,
      },
    ]);
    setVoterForm({ regNo: "", name: "", level: "200L" });
    setNotice("Demo voter registered successfully.");
  }

  function addCandidate(event) {
    event.preventDefault();
    setNotice("");

    if (!candidateForm.name.trim()) {
      setNotice("Enter the candidate's name.");
      return;
    }

    setCandidates((current) => [
      ...current,
      {
        id: Date.now(),
        name: candidateForm.name.trim(),
        post: candidateForm.post,
        manifesto: candidateForm.manifesto.trim(),
        active: true,
      },
    ]);
    setCandidateForm({
      name: "",
      post: initialPosts[0],
      manifesto: "",
    });
    setNotice("Demo candidate registered successfully.");
  }

  function toggleVoter(id) {
    setVoters((current) =>
      current.map((voter) =>
        voter.id === id ? { ...voter, active: !voter.active } : voter
      )
    );
    setNotice("Voter status updated in demo data.");
  }

  function toggleCandidate(id) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id
          ? { ...candidate, active: !candidate.active }
          : candidate
      )
    );
    setNotice("Candidate status updated in demo data.");
  }

  function resetDemoData() {
    if (!window.confirm("Reset all demo voters and candidates to the original sample data?")) {
      return;
    }

    setVoters(initialVoters);
    setCandidates(initialCandidates);
    setSearch("");
    setNotice("Demo data restored.");
  }

  const navItems = ["Overview", "Voters", "Candidates", "Election & Results"];

  return (
    <div className="unn-admin">
      <aside className="unn-sidebar">
        <div className="unn-brand">
          <div className="unn-brand-mark">N</div>
          <div>
            <strong>NACOS UNN</strong>
            <span>Voting prototype</span>
          </div>
        </div>

        <div className="unn-sidebar-label">WORKSPACE</div>
        <nav className="unn-nav">
          {navItems.map((item) => (
            <button
              key={item}
              className={tab === item ? "selected" : ""}
              onClick={() => {
                setTab(item);
                setSearch("");
                setNotice("");
              }}
            >
              <span className="unn-nav-dot" />
              {item}
            </button>
          ))}
        </nav>

        <div className="unn-sidebar-bottom">
          <span className="unn-demo-badge">DEMO MODE</span>
          <p>Fictional data only. Not an official NACOS election portal.</p>
        </div>
      </aside>

      <main className="unn-main">
        <header className="unn-topbar">
          <div>
            <div className="unn-breadcrumb">NACOS UNN / Admin</div>
            <h1>{tab}</h1>
          </div>
          <button className="unn-secondary-button" onClick={resetDemoData}>
            Reset demo data
          </button>
        </header>

        <div className="unn-content">
          {notice && <div className="unn-notice">{notice}</div>}

          {tab === "Overview" && (
            <>
              <section className="unn-welcome">
                <div>
                  <span className="unn-eyebrow">ADMINISTRATION CONSOLE</span>
                  <h2>Election management, made verifiable.</h2>
                  <p>
                    Manage demo voters and candidates here. Blockchain
                    integration will be added after the interface is ready.
                  </p>
                </div>
                <div className="unn-welcome-icon">✓</div>
              </section>

              <section className="unn-stat-grid">
                <article className="unn-stat-card">
                  <span>Total demo voters</span>
                  <strong>{voters.length}</strong>
                  <small>{activeVoters} active</small>
                </article>
                <article className="unn-stat-card">
                  <span>Total candidates</span>
                  <strong>{candidates.length}</strong>
                  <small>{activeCandidates} active</small>
                </article>
                <article className="unn-stat-card">
                  <span>Election offices</span>
                  <strong>{posts.length}</strong>
                  <small>Configured for demo</small>
                </article>
                <article className="unn-stat-card">
                  <span>Blockchain status</span>
                  <strong className="unn-pending">Not connected</strong>
                  <small>Integration pending</small>
                </article>
              </section>

              <section className="unn-panel">
                <div className="unn-panel-heading">
                  <div>
                    <h3>Quick actions</h3>
                    <p>Manage the prototype's sample records.</p>
                  </div>
                </div>
                <div className="unn-quick-actions">
                  <button onClick={() => setTab("Voters")}>+ Register a voter</button>
                  <button onClick={() => setTab("Candidates")}>+ Register a candidate</button>
                  <button onClick={() => setTab("Election & Results")}>View election setup</button>
                </div>
              </section>

              <section className="unn-panel">
                <div className="unn-panel-heading">
                  <div>
                    <h3>Configured offices</h3>
                    <p>Each office has its own candidate list.</p>
                  </div>
                </div>
                <div className="unn-office-list">
                  {posts.map((post) => (
                    <div className="unn-office-row" key={post}>
                      <span>{post}</span>
                      <strong>{candidates.filter((c) => c.post === post && c.active).length} active candidates</strong>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === "Voters" && (
            <>
              <section className="unn-panel">
                <div className="unn-panel-heading">
                  <div>
                    <h3>Register a demo voter</h3>
                    <p>Use fictional IDs such as UNN-CS-006.</p>
                  </div>
                </div>
                <form className="unn-form" onSubmit={addVoter}>
                  <label>
                    Voter ID
                    <input
                      value={voterForm.regNo}
                      onChange={(e) => setVoterForm({ ...voterForm, regNo: e.target.value })}
                      placeholder="UNN-CS-006"
                      required
                    />
                  </label>
                  <label>
                    Full name
                    <input
                      value={voterForm.name}
                      onChange={(e) => setVoterForm({ ...voterForm, name: e.target.value })}
                      placeholder="Demo Voter Six"
                      required
                    />
                  </label>
                  <label>
                    Level
                    <select
                      value={voterForm.level}
                      onChange={(e) => setVoterForm({ ...voterForm, level: e.target.value })}
                    >
                      {["100L", "200L", "300L", "400L", "500L"].map((level) => (
                        <option key={level}>{level}</option>
                      ))}
                    </select>
                  </label>
                  <button className="unn-primary-button" type="submit">Register voter</button>
                </form>
              </section>

              <section className="unn-panel">
                <div className="unn-panel-heading">
                  <div>
                    <h3>Voter directory</h3>
                    <p>{voters.length} demo records</p>
                  </div>
                  <input
                    className="unn-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search voters..."
                  />
                </div>
                <div className="unn-table-wrap">
                  <table className="unn-table">
                    <thead><tr><th>Voter ID</th><th>Name</th><th>Level</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {filteredVoters.map((voter) => (
                        <tr key={voter.id}>
                          <td>{voter.regNo}</td>
                          <td>{voter.name}</td>
                          <td>{voter.level}</td>
                          <td><span className={`unn-status ${voter.active ? "active" : "inactive"}`}>{voter.active ? "Active" : "Inactive"}</span></td>
                          <td><button className="unn-row-button" onClick={() => toggleVoter(voter.id)}>{voter.active ? "Deactivate" : "Activate"}</button></td>
                        </tr>
                      ))}
                      {filteredVoters.length === 0 && <tr><td colSpan="5">No matching voters found.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {tab === "Candidates" && (
            <>
              <section className="unn-panel">
                <div className="unn-panel-heading">
                  <div>
                    <h3>Register a demo candidate</h3>
                    <p>These are sample candidates, not real aspirants.</p>
                  </div>
                </div>
                <form className="unn-form" onSubmit={addCandidate}>
                  <label>
                    Candidate name
                    <input
                      value={candidateForm.name}
                      onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })}
                      placeholder="Enter fictional name"
                      required
                    />
                  </label>
                  <label>
                    Office
                    <select
                      value={candidateForm.post}
                      onChange={(e) => setCandidateForm({ ...candidateForm, post: e.target.value })}
                    >
                      {posts.map((post) => <option key={post}>{post}</option>)}
                    </select>
                  </label>
                  <label>
                    Manifesto summary
                    <input
                      value={candidateForm.manifesto}
                      onChange={(e) => setCandidateForm({ ...candidateForm, manifesto: e.target.value })}
                      placeholder="Short campaign promise"
                    />
                  </label>
                  <button className="unn-primary-button" type="submit">Register candidate</button>
                </form>
              </section>

              <section className="unn-panel">
                <div className="unn-panel-heading">
                  <div>
                    <h3>Candidate directory</h3>
                    <p>{candidates.length} demo records</p>
                  </div>
                  <input
                    className="unn-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search candidates..."
                  />
                </div>
                <div className="unn-candidate-grid">
                  {filteredCandidates.map((candidate) => (
                    <article className="unn-candidate-card" key={candidate.id}>
                      <div className="unn-avatar">{candidate.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>
                      <div className="unn-candidate-info">
                        <span className="unn-candidate-office">{candidate.post}</span>
                        <h4>{candidate.name}</h4>
                        <p>{candidate.manifesto || "No manifesto summary added."}</p>
                        <span className={`unn-status ${candidate.active ? "active" : "inactive"}`}>{candidate.active ? "Active" : "Inactive"}</span>
                      </div>
                      <button className="unn-row-button" onClick={() => toggleCandidate(candidate.id)}>{candidate.active ? "Deactivate" : "Activate"}</button>
                    </article>
                  ))}
                  {filteredCandidates.length === 0 && <p>No matching candidates found.</p>}
                </div>
              </section>
            </>
          )}

          {tab === "Election & Results" && (
            <>
              <section className="unn-panel">
                <div className="unn-panel-heading">
                  <div>
                    <h3>Election configuration</h3>
                    <p>Prototype status, not connected to the smart contract.</p>
                  </div>
                  <span className="unn-status inactive">Not deployed</span>
                </div>
                <div className="unn-office-list">
                  <div className="unn-office-row"><span>Election type</span><strong>Simulated NACOS UNN election</strong></div>
                  <div className="unn-office-row"><span>Voting rule</span><strong>One candidate per office</strong></div>
                  <div className="unn-office-row"><span>Active voters</span><strong>{activeVoters}</strong></div>
                  <div className="unn-office-row"><span>Active candidates</span><strong>{activeCandidates}</strong></div>
                  <div className="unn-office-row"><span>Verified blockchain votes</span><strong>Not available yet</strong></div>
                </div>
              </section>
              <section className="unn-panel">
                <h3>Next integration step</h3>
                <p className="unn-muted">
                  This screen currently displays configuration only. We will connect
                  voting, on-chain vote recording, and result verification after the
                  admin screens are tested.
                </p>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
