import { ArrowLeft, Lock, Mail, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import liberty from "../assets/liberty.jpeg";
import { api } from "../lib/api";

const PENDING_OTP_KEY = "nacosUnnPendingOtp";
const PENDING_OTP_MAX_AGE = 1000 * 60 * 60 * 6;

function normalizePendingOtp(value) {
  if (!value?.regNo) return null;
  const savedAt = Number(value.savedAt || 0);
  if (savedAt && Date.now() - savedAt > PENDING_OTP_MAX_AGE) return null;
  return {
    regNo: String(value.regNo || "")
      .trim()
      .toUpperCase(),
    sentTo: value.sentTo || "your registered email",
    savedAt: savedAt || Date.now(),
  };
}

function savePendingOtp(regNo, sentTo = "") {
  const payload = JSON.stringify({
    regNo,
    sentTo: sentTo || "your registered email",
    savedAt: Date.now(),
  });
  try {
    localStorage.setItem(PENDING_OTP_KEY, payload);
  } catch {
    // Some browsers can block localStorage; sessionStorage is the fallback.
  }
  try {
    sessionStorage.setItem(PENDING_OTP_KEY, payload);
  } catch {
    // Some browsers can block sessionStorage; the normal OTP flow still works.
  }
}

function clearPendingOtp() {
  try {
    localStorage.removeItem(PENDING_OTP_KEY);
  } catch {
    // Some browsers can block localStorage; clearing is best-effort.
  }
  try {
    sessionStorage.removeItem(PENDING_OTP_KEY);
  } catch {
    // Some browsers can block sessionStorage; clearing is best-effort.
  }
}

function readPendingOtp() {
  const stores = [sessionStorage, localStorage];
  for (const store of stores) {
    try {
      const pending = normalizePendingOtp(
        JSON.parse(store.getItem(PENDING_OTP_KEY) || "null"),
      );
      if (pending) return pending;
    } catch {
      clearPendingOtp();
    }
  }
  return null;
}

function persistVoterSession(voter, token) {
  const voterPayload = JSON.stringify(voter);
  try {
    localStorage.setItem("nacosUnnVoter", voterPayload);
    if (token) localStorage.setItem("nacosUnnVoterToken", token);
  } catch {
    // sessionStorage fallback below keeps the login flow usable.
  }
  try {
    sessionStorage.setItem("nacosUnnVoter", voterPayload);
    if (token) sessionStorage.setItem("nacosUnnVoterToken", token);
  } catch {
    // Browser storage can be restricted; the API cookie is still set.
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState("reg");
  const [regNo, setRegNo] = useState("");
  const [otp, setOtp] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function restorePendingOtp() {
      const pending = readPendingOtp();
      if (!pending?.regNo) return;

      setRegNo(pending.regNo);
      setSentTo(pending.sentTo || "your registered email");
      setStep("otp");
    }

    restorePendingOtp();
    window.addEventListener("pageshow", restorePendingOtp);
    window.addEventListener("focus", restorePendingOtp);
    return () => {
      window.removeEventListener("pageshow", restorePendingOtp);
      window.removeEventListener("focus", restorePendingOtp);
    };
  }, []);

  async function requestOtp() {
    setError("");
    if (!regNo.trim()) {
      setError("Enter your registration number.");
      return;
    }

    try {
      setLoading(true);
      const cleanRegNo = regNo.trim().toUpperCase();
      const data = await api.requestOtp(cleanRegNo);
      setSentTo(data.sentTo);
      setDevOtp(data.devOtp || "");
      savePendingOtp(cleanRegNo, data.sentTo);
      setStep("otp");
      setOtp("");
    } catch (err) {
      if (err.data?.code === "PENDING_OTP") {
        const pendingRegNo = err.data.regNo || regNo.trim().toUpperCase();
        const pendingSentTo = err.data.sentTo || "your registered email";
        setRegNo(pendingRegNo);
        setSentTo(pendingSentTo);
        setDevOtp("");
        savePendingOtp(pendingRegNo, pendingSentTo);
        setStep("otp");
        setError("Enter the OTP already sent to your email.");
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setError("");
    if (!otp.trim()) {
      setError("Enter your OTP.");
      return;
    }

    try {
      setLoading(true);
      const data = await api.verifyOtp(regNo.trim().toUpperCase(), otp);
      persistVoterSession(data.voter, data.token);
      clearPendingOtp();
      navigate("/ballot");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page" style={{ backgroundImage: `url(${liberty})` }}>
      <div className="page-scrim">
        <section className="login-panel" aria-label="NACOS UNN voter login">
          <div className="login-logo nacos-logo-placeholder" aria-label="NACOS UNN">N</div>
          <h1>NACOS UNN</h1>
          <p>Election voting portal</p>

          {step === "reg" ? (
            <div className="form-stack">
              <label>
                <span>Registration Number</span>
                <div className="field">
                  <User size={18} />
                  <input
                    value={regNo}
                    onChange={(event) =>
                      setRegNo(event.target.value.toUpperCase())
                    }
                    placeholder="Enter your reg no"
                    autoComplete="username"
                  />
                </div>
              </label>
              {error && <p className="error-text">{error}</p>}
              <button
                className="primary-button"
                disabled={loading}
                onClick={requestOtp}
              >
                {loading ? "Sending OTP..." : "Send OTP"}
              </button>
            </div>
          ) : (
            <form className="form-stack" onSubmit={verifyOtp}>
              <div className="notice">
                <Mail size={18} />
                <span>OTP sent to {sentTo}</span>
              </div>
              {devOtp && (
                <div className="notice warning">
                  <span>Local test OTP: {devOtp}</span>
                </div>
              )}
              <label>
                <span>OTP Code</span>
                <div className="field">
                  <Lock size={18} />
                  <input
                    value={otp}
                    onChange={(event) =>
                      setOtp(
                        event.target.value
                          .toUpperCase()
                          .replace(/\s/g, "")
                          .slice(0, 12),
                      )
                    }
                    placeholder="Enter OTP"
                    inputMode="text"
                    maxLength={12}
                    autoComplete="one-time-code"
                  />
                </div>
              </label>
              {error && <p className="error-text">{error}</p>}
              <button className="primary-button" disabled={loading}>
                {loading ? "Verifying..." : "Login to Vote"}
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={loading}
                onClick={requestOtp}
              >
                {loading ? "Sending..." : "Resend OTP"}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setStep("reg");
                  setOtp("");
                  setDevOtp("");
                  setError("");
                  clearPendingOtp();
                }}
              >
                <ArrowLeft size={16} />
                Change registration number
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
