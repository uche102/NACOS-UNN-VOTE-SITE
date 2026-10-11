import { CheckCircle, LogOut, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import welcome from "../assets/welcome.jpeg";
import { api } from "../lib/api";
import { inferEligibleLevel } from "../lib/post-order";

function normalizeLevel(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/LEVEL$/, "L")
    .replace(/LVL$/, "L");
  return /^(200|300|400|500)$/.test(normalized) ? `${normalized}L` : normalized;
}

function isHorPost(post) {
  const title = String(post?.title || "").toLowerCase();
  return (
    title.includes("hor") ||
    title.includes("house of rep") ||
    title.includes("house of representative")
  );
}
function getHorMaxSelections(post, voter) {
  const level = String(voter?.level || "")
    .toUpperCase()
    .replace(/\s+/g, "");

  const is200Level =
    level === "200" ||
    level === "200L" ||
    level === "200LVL" ||
    level === "200LEVEL";

  if (isHorPost(post) && is200Level) {
    return 5;
  }

  return Infinity;
}

function readStoredSession(key) {
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

function clearVoterSession() {
  sessionStorage.removeItem("nacosUnnVoter");
  sessionStorage.removeItem("nacosUnnVoterToken");
  localStorage.removeItem("nacosUnnVoter");
  localStorage.removeItem("nacosUnnVoterToken");
}

export default function Ballot() {
  const navigate = useNavigate();
  const [voter, setVoter] = useState(null);
  const [posts, setPosts] = useState([]);
  const [selections, setSelections] = useState({});
  const [votingOpen, setVotingOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const storedVoter = readStoredSession("nacosUnnVoter");
      const hasToken = readStoredSession("nacosUnnVoterToken");

      if (!storedVoter || !hasToken) {
        navigate("/", { replace: true });
        return;
      }

      try {
        const [meResult, election] = await Promise.allSettled([
          api.me(),
          api.election(),
        ]);
        const me = meResult.status === "fulfilled" ? meResult.value : null;

        if (me?.hasVoted) {
          navigate("/success", { replace: true });
          return;
        }

        setVoter(me?.voter ? me.voter : JSON.parse(storedVoter));
        if (election.status === "fulfilled") {
          setVotingOpen(election.value.votingOpen !== false);
          setPosts(election.value.posts);
        } else {
          throw election.reason;
        }
      } catch {
        clearVoterSession();
        navigate("/", { replace: true });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  const voterLevel = normalizeLevel(voter?.level);

  const isPostEligible = useCallback((post) => {
    const eligibleLevel = normalizeLevel(inferEligibleLevel(post));
    return !eligibleLevel || eligibleLevel === voterLevel;
  }, [voterLevel]);

  const selectablePosts = useMemo(
    () => posts.filter(isPostEligible),
    [posts, isPostEligible],
  );
  const selectedCount = selectablePosts.filter((post) => {
    const value = selections[post.id];
    return isHorPost(post)
      ? Array.isArray(value) && value.length > 0
      : Boolean(value);
  }).length;
  const canSubmit =
    votingOpen &&
    selectablePosts.length > 0 &&
    selectedCount === selectablePosts.length;

  const voterLabel = useMemo(() => {
    if (!voter) return "";
    return [voter.name, voter.reg_no].filter(Boolean).join(" · ");
  }, [voter]);

  async function submitVote() {
    setError("");
    if (!canSubmit) {
      setError(
        "Select candidate(s) for every post available to your level before submitting.",
      );
      return;
    }

    try {
      setSubmitting(true);
      const receipt = await api.vote(selections);
      navigate("/success", { state: { receipt } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelect(post, candidateId) {
    if (!isPostEligible(post) || !votingOpen || submitting) return;

    setSelections((current) => {
      if (isHorPost(post)) {
        const selectedForPost = Array.isArray(current[post.id])
          ? current[post.id]
          : [];

        const alreadySelected = selectedForPost.includes(candidateId);
        const maxSelections = getHorMaxSelections(post, voter);

        if (
          Number.isFinite(maxSelections) &&
          !alreadySelected &&
          selectedForPost.length >= maxSelections
        ) {
          alert(
            `200 level voters can only select a maximum of ${maxSelections} HOR candidates.`,
          );
          return current;
        }

        return {
          ...current,
          [post.id]: alreadySelected
            ? selectedForPost.filter((id) => id !== candidateId)
            : [...selectedForPost, candidateId],
        };
      }

      return {
        ...current,
        [post.id]: candidateId,
      };
    });
  }

  function logout() {
    clearVoterSession();
    navigate("/");
  }

  if (loading) {
    return <div className="loading-screen">Loading ballot...</div>;
  }

  return (
    <div className="app-page" style={{ backgroundImage: `url(${welcome})` }}>
      <div className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">NACOS UNN</p>
            <h1>Election Ballot</h1>
            <p>{voterLabel}</p>
          </div>
          <button className="icon-button" onClick={logout} title="Logout">
            <LogOut size={18} />
          </button>
        </header>

        <div className="status-row">
          <CheckCircle size={18} />
          <span>
            {votingOpen
              ? `${selectedCount} of ${selectablePosts.length} available posts selected`
              : "Voting is currently closed"}
          </span>
        </div>

        {selectablePosts.length === 0 && (
          <section className="empty-state">
            No active election posts are available for your level.
          </section>
        )}

        <div className="post-list">
          {posts.map((post) => {
            const isEligible = isPostEligible(post);
            return (
              <section
                className={`post-section ${!isEligible ? "post-section-ineligible" : ""} ${post.title.toLowerCase().includes("squid game") ? "post-section-featured" : ""}`}
                key={post.id}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1rem",
                  }}
                >
                  <h2>{post.title}</h2>
                  {!isEligible && (
                    <span
                      style={{
                        fontSize: "0.875rem",
                        color: "#666",
                        backgroundColor: "#f0f0f0",
                        padding: "0.25rem 0.75rem",
                        borderRadius: "4px",
                      }}
                    >
                      Not eligible for your level
                    </span>
                  )}
                </div>
                <div className="candidate-grid">
                  {post.candidates.map((candidate) => {
                    const hor = isHorPost(post);
                    const value = selections[post.id];
                    const selected = hor
                      ? Array.isArray(value) && value.includes(candidate.id)
                      : value === candidate.id;
                    const canSelect = isEligible && votingOpen && !submitting;
                    return (
                      <button
                        type="button"
                        key={candidate.id}
                        className={`candidate-card ${selected ? "selected" : ""} ${!isEligible ? "candidate-card-ineligible" : ""} ${
                          post.title.toLowerCase().includes("squid game")
                            ? "candidate-card-large"
                            : ""
                        }`}
                        disabled={!canSelect}
                        onClick={() => handleSelect(post, candidate.id)}
                        title={
                          !isEligible
                            ? `You are not eligible to vote for ${post.title}`
                            : ""
                        }
                      >
                        <div className="candidate-avatar">
                          {candidate.image_url ? (
                            <img
                              src={candidate.image_url}
                              alt={candidate.name}
                            />
                          ) : (
                            <UserRound
                              size={
                                post.title.toLowerCase().includes("squid game")
                                  ? 48
                                  : 39
                              }
                            />
                          )}
                        </div>
                        <strong>{candidate.name}</strong>
                        {candidate.tagline && <span>{candidate.tagline}</span>}
                        <small>
                          {selected
                            ? hor
                              ? "Selected · tap to remove"
                              : "Selected"
                            : isEligible
                              ? hor
                                ? "Tap to select multiple"
                                : "Tap to select"
                              : "Not eligible"}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="sticky-action">
          <button
            className="primary-button"
            disabled={!canSubmit || submitting}
            onClick={submitVote}
          >
            {submitting
              ? "Submitting..."
              : votingOpen
                ? "Submit Ballot"
                : "Voting Closed"}
          </button>
        </div>
      </div>
    </div>
  );
}
