import { ArrowLeft, KeyRound, Lock, User } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import liberty from "../assets/liberty.jpeg";
import { api } from "../lib/api";

function persistVoterSession(voter, token) {
  const voterPayload = JSON.stringify(voter);

  for (const store of [localStorage, sessionStorage]) {
    try {
      store.setItem("nacosUnnVoter", voterPayload);
      if (token) store.setItem("nacosUnnVoterToken", token);
    } catch {
      // The API cookie may still maintain the session.
    }
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [regNo, setRegNo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setSetupCode("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const cleanRegNo = regNo.trim().toUpperCase();

    if (!cleanRegNo) {
      setError("Enter your registration number.");
      return;
    }

    if (mode === "setup") {
      if (!setupCode.trim()) {
        setError("Enter the one-time setup code given to you by the administrator.");
        return;
      }
      if (password.length < 12) {
        setError("Your password must contain at least 12 characters.");
        return;
      }
      if (new TextEncoder().encode(password).length > 128) {
        setError("Your password is too long.");
        return;
      }
      if (password !== confirmPassword) {
        setError("The passwords do not match.");
        return;
      }
    } else if (!password) {
      setError("Enter your password.");
      return;
    }

    try {
      setLoading(true);

      if (mode === "setup") {
        await api.setupPassword(cleanRegNo, setupCode.trim(), password);
        setPassword("");
        setConfirmPassword("");
        setSetupCode("");
        setMode("login");
        setMessage("Password created successfully. You can now log in.");
        return;
      }

      const data = await api.passwordLogin(cleanRegNo, password);
      persistVoterSession(data.voter, data.token);
      navigate("/ballot");
    } catch (err) {
      setError(err.message || "The request could not be completed.");
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

          <div className="form-stack">
            <div className="login-mode-switch" aria-label="Account options">
              <button
                type="button"
                className={mode === "login" ? "primary-button" : "ghost-button"}
                onClick={() => changeMode("login")}
                disabled={loading}
              >
                Log in
              </button>
              <button
                type="button"
                className={mode === "setup" ? "primary-button" : "ghost-button"}
                onClick={() => changeMode("setup")}
                disabled={loading}
              >
                Set password
              </button>
            </div>

            <form className="form-stack" onSubmit={handleSubmit}>
              <label>
                <span>Registration Number</span>
                <div className="field">
                  <User size={18} />
                  <input
                    value={regNo}
                    onChange={(event) => setRegNo(event.target.value.toUpperCase())}
                    placeholder="Enter your registration number"
                    autoComplete="username"
                    maxLength={80}
                    required
                  />
                </div>
              </label>

              {mode === "setup" && (
                <label>
                  <span>One-time setup code</span>
                  <div className="field">
                    <KeyRound size={18} />
                    <input
                      value={setupCode}
                      onChange={(event) => setSetupCode(event.target.value.trim())}
                      placeholder="Enter the code from your administrator"
                      autoComplete="one-time-code"
                      maxLength={200}
                      required
                    />
                  </div>
                </label>
              )}

              <label>
                <span>{mode === "setup" ? "Create password" : "Password"}</span>
                <div className="field">
                  <Lock size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={mode === "setup" ? "At least 12 characters" : "Enter your password"}
                    autoComplete={mode === "setup" ? "new-password" : "current-password"}
                    maxLength={128}
                    required
                  />
                </div>
              </label>

              {mode === "setup" && (
                <label>
                  <span>Confirm password</span>
                  <div className="field">
                    <Lock size={18} />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Enter your password again"
                      autoComplete="new-password"
                      maxLength={128}
                      required
                    />
                  </div>
                </label>
              )}

              {error && <p className="error-text" role="alert">{error}</p>}
              {message && <p className="notice" role="status">{message}</p>}

              <button className="primary-button" disabled={loading}>
                {loading
                  ? "Please wait..."
                  : mode === "setup"
                    ? "Create password"
                    : "Login to Vote"}
              </button>
            </form>

            <p className="login-help">
              {mode === "setup"
                ? "Your administrator must generate a setup code for your voter ID. Codes expire after 15 minutes and can only be used once."
                : "First time here? Select Set password after receiving a one-time setup code from your administrator."}
            </p>

            <button
              type="button"
              className="ghost-button"
              onClick={() => navigate(-1)}
              disabled={loading}
            >
              <ArrowLeft size={16} />
              Go back
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
