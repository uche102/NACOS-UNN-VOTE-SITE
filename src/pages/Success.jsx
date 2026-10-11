import { CheckCircle, Copy, Home } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import welcome from "../assets/welcome.jpeg";

export default function Success() {
  const navigate = useNavigate();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const receipt = location.state?.receipt;
  const transactionHash = receipt?.transactionHash;
  const blockNumber = receipt?.blockNumber;

  async function copyHash() {
    if (!transactionHash) return;
    try {
      await navigator.clipboard.writeText(transactionHash);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

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

        {transactionHash ? (
          <div className="transaction-receipt">
            <h2>Blockchain receipt</h2>
            <p className="receipt-status">Transaction confirmed</p>
            <label>
              <span>Transaction hash</span>
              <code className="receipt-hash">{transactionHash}</code>
            </label>
            <button type="button" className="ghost-button" onClick={copyHash}>
              <Copy size={16} />
              {copied ? "Hash copied" : "Copy transaction hash"}
            </button>
            {blockNumber != null && (
              <p className="receipt-block">
                Block number: <strong>{blockNumber}</strong>
              </p>
            )}
          </div>
        ) : (
          <p className="receipt-unavailable">
            No transaction receipt is available on this page. If you arrived
            here by refreshing or opening the page directly, check your ballot
            submission history or contact the election administrator.
          </p>
        )}

        <button className="primary-button" onClick={finish}>
          <Home size={18} />
          Finish
        </button>
      </section>
    </div>
  );
}
