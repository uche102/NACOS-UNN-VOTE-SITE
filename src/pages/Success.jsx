import { CheckCircle, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";
import welcome from "../assets/welcome.jpeg";

export default function Success() {
  const navigate = useNavigate();

  function finish() {
    sessionStorage.removeItem("nacosUnnVoter");
    sessionStorage.removeItem("nacosUnnVoterToken");
    localStorage.removeItem("nacosUnnVoter");
    localStorage.removeItem("nacosUnnVoterToken");
    navigate("/");
  }

  return (
    <div className="app-page centered" style={{ backgroundImage: `url(${welcome})` }}>
      <section className="success-panel">
        <CheckCircle size={64} />
        <h1>Vote Submitted</h1>
        <p>Your ballot has been recorded for the NACOS UNN election.</p>
        <button className="primary-button" onClick={finish}>
          <Home size={18} />
          Finish
        </button>
      </section>
    </div>
  );
}
