import { useEffect, useState } from "react";
import { assistGlobalRubric } from "../services/openaiService";

function GlobalRubricAssistantModal({
  isOpen,
  onClose,
  language,
  currentGlobalRubric,
  onApplyGlobalRubric,
  llmConfig
}) {
  const [requestText, setRequestText] = useState("");
  const [suggestedRubric, setSuggestedRubric] = useState("");
  const [status, setStatus] = useState("");
  const [assistantNote, setAssistantNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRequestText("");
    setSuggestedRubric(currentGlobalRubric || "");
    setStatus("");
    setAssistantNote("");
    setError("");
    setLoading(false);
  }, [isOpen, currentGlobalRubric]);

  if (!isOpen) return null;

  async function handleGenerate() {
    if (!requestText.trim()) {
      setError("Please type your request first.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await assistGlobalRubric({
        language,
        existingGlobalRubric: currentGlobalRubric,
        request: requestText,
        llmConfig
      });
      setSuggestedRubric(result.globalRubric);
      setAssistantNote(result.note);
      setStatus("AI suggestion generated");
      window.setTimeout(() => setStatus(""), 1400);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI assistant failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleUseSuggestedRubric() {
    onApplyGlobalRubric(suggestedRubric);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Global Rubric Assistant">
      <div className="modal-card global-rubric-modal">
        <div className="modal-header">
          <h2>Global Rubric Assistant</h2>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="splitter-grid">
          <div className="splitter-col">
            <label htmlFor="globalRubricCurrent">Current global rubric</label>
            <textarea
              id="globalRubricCurrent"
              value={currentGlobalRubric || ""}
              rows={8}
              readOnly
              placeholder="No global rubric yet."
            />
            <label htmlFor="globalRubricRequest">Your request for AI</label>
            <textarea
              id="globalRubricRequest"
              value={requestText}
              onChange={(event) => setRequestText(event.target.value)}
              rows={10}
              placeholder='Example: "Add a rule to reward clean variable naming and concise comments, and reduce penalty for small formatting differences."'
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate Global Rubric"}
            </button>
          </div>

          <div className="splitter-col">
            <label htmlFor="globalRubricSuggested">Suggested global rubric (editable)</label>
            <textarea
              id="globalRubricSuggested"
              value={suggestedRubric}
              onChange={(event) => setSuggestedRubric(event.target.value)}
              rows={14}
              placeholder="AI-generated rubric will appear here..."
            />
            {assistantNote ? <p className="hint-text">AI note: {assistantNote}</p> : null}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={handleUseSuggestedRubric}>
            Use This Global Rubric
          </button>
          {status ? <span className="copy-status">{status}</span> : null}
        </div>
        {error ? <p className="error-message">{error}</p> : null}
      </div>
    </div>
  );
}

export default GlobalRubricAssistantModal;
