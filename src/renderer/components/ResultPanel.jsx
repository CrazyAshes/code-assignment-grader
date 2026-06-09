import { useState } from "react";

function ResultPanel({ loading, result, error, studentName, studentCode, studentStatus }) {
  const [copyStatus, setCopyStatus] = useState("");
  const [codeExpanded, setCodeExpanded] = useState(false);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="result-state-card result-state-loading">
        <div className="spinner" />
        <h3>Grading in progress...</h3>
        <p>The model is analyzing the rubric, question, and student code.</p>
      </div>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <div className="result-state-card result-state-error" role="alert">
        <h3>Unable to grade this submission</h3>
        <p>{error}</p>
      </div>
    );
  }

  /* ── Empty state ── */
  if (!result) {
    return (
      <div className="result-state-card result-state-empty">
        <div style={{ fontSize: "32px", opacity: 0.3 }}>◎</div>
        {studentName ? (
          <>
            <h3>{studentName}</h3>
            <p>No grading result yet for this student.</p>
          </>
        ) : (
          <>
            <h3>Ready to grade</h3>
            <p>Fill in the fields on the left and click Grade.</p>
          </>
        )}
      </div>
    );
  }

  /* ── Compute scores ── */
  const criteriaEarned = result.criteria.map((c) =>
    typeof c.score === "number" ? c.score : Number(c.score) || 0
  );
  const criteriaMax = result.criteria.map((c) => {
    if (typeof c.max_score === "number") return c.max_score;
    const parsed = Number(c.max_score);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : (typeof c.score === "number" ? c.score : 0);
  });
  const sumEarned = criteriaEarned.reduce((a, b) => a + b, 0);
  const sumMaxFromRows = criteriaMax.reduce((a, b) => a + b, 0);
  const sumMax = typeof result.total_max_score === "number" ? result.total_max_score : sumMaxFromRows;

  const fractionParts = criteriaEarned.map((e, i) => `${e}/${criteriaMax[i] ?? "?"}`);
  const additionLine = fractionParts.length > 0 ? fractionParts.join(" + ") : "0";
  const totalsLine = `Earned: ${sumEarned} / Possible: ${sumMax}`;
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];

  /* ── Copy text helpers ── */
  const feedbackText = [
    studentName ? `Student: ${studentName}` : null,
    `Score: ${sumEarned}/${sumMax}`,
    "",
    "Strengths:",
    ...(result.strengths?.length ? result.strengths.map((s) => `- ${s}`) : ["- None"]),
    "",
    "Major Issues:",
    ...(result.bugs?.length ? result.bugs.map((b) => `- ${b}`) : ["- None"]),
    "",
    "Suggestions:",
    ...(suggestions.length ? suggestions.map((s) => `- ${s}`) : ["- None"]),
    "",
    "Final Feedback:",
    result.feedback || ""
  ].filter((l) => l !== null).join("\n");

  const criteriaLines = result.criteria.map((item, index) => {
    const earned = criteriaEarned[index];
    const max = criteriaMax[index];
    return `- ${item.name}: ${earned}/${max}\n  Reason: ${item.reason}`;
  });

  const fullResultLines = [
    studentName ? `Student: ${studentName}` : null,
    `Total score: ${sumEarned}/${sumMax}`,
    "",
    "Criteria breakdown:",
    ...(criteriaLines.length ? criteriaLines : ["- None"]),
    "",
    `Add up: ${additionLine}`,
    totalsLine,
    "",
    "Strengths:",
    ...(result.strengths?.length ? result.strengths.map((s) => `- ${s}`) : ["- None"]),
    "",
    "Major issues:",
    ...(result.bugs?.length ? result.bugs.map((b) => `- ${b}`) : ["- None"])
  ].filter((l) => l !== null);
  if (suggestions.length) {
    fullResultLines.push("", "Suggestions:", ...suggestions.map((s) => `- ${s}`));
  }
  fullResultLines.push("", "Final feedback:", result.feedback || "");
  const fullResultText = fullResultLines.join("\n");

  async function copyText(value, successMessage) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const temp = document.createElement("textarea");
        temp.value = value;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      setCopyStatus(successMessage);
      window.setTimeout(() => setCopyStatus(""), 1400);
    } catch (_err) {
      setCopyStatus("Copy failed");
      window.setTimeout(() => setCopyStatus(""), 1800);
    }
  }

  /* ── Score color ── */
  const pct = sumMax > 0 ? sumEarned / sumMax : 0;
  const scoreColor = pct >= 0.8 ? "var(--color-success)" : pct >= 0.5 ? "var(--color-warning)" : "var(--color-error)";

  return (
    <div className="result-content">

      {/* Student name header (batch mode) */}
      {studentName && (
        <div className="result-student-header">
          <span className="result-student-name">{studentName}</span>
          {studentStatus && (
            <span className={
              studentStatus === "Done" ? "status-chip status-done" :
              studentStatus === "Error" ? "status-chip status-error" :
              "status-chip status-not-started"
            }>{studentStatus}</span>
          )}
        </div>
      )}

      {/* Big score display */}
      <div className="score-hero">
        <span className="score-hero-value" style={{ color: scoreColor }}>{sumEarned}</span>
        <span className="score-hero-max">/ {sumMax}</span>
      </div>
      <div className="score-hero-label">Total Score</div>

      {typeof result.model_total_score_mismatch === "number" && (
        <p className="total-score-mismatch">
          Model-reported total did not match the sum of criteria — displayed total was recalculated automatically.
        </p>
      )}

      {/* Copy actions */}
      <div className="copy-actions">
        <button type="button" className="btn-secondary" onClick={() => copyText(feedbackText, "Copied feedback")}>
          Copy Feedback
        </button>
        <button type="button" className="btn-secondary" onClick={() => copyText(fullResultText, "Copied full result")}>
          Copy Full Result
        </button>
        {copyStatus && <span className="copy-status">✓ {copyStatus}</span>}
      </div>

      {/* Criteria breakdown */}
      <div className="result-section">
        <div className="result-section-header">
          <span className="result-section-dot gray" />
          <h3>Criteria Breakdown</h3>
        </div>
        <ul className="criteria-list">
          {result.criteria.map((item, index) => {
            const earned = criteriaEarned[index];
            const max = criteriaMax[index];
            return (
              <li key={`${item.name}-${index}`}>
                <div className="criteria-header">
                  <strong className="criterion-name">{item.name}</strong>
                  <span className="criterion-points">{earned}/{max} pts</span>
                </div>
                <p className="criterion-evidence-label">Evidence</p>
                <p>{item.reason}</p>
              </li>
            );
          })}
        </ul>
        <div className="criteria-sum-box" aria-label="Sum of criterion points">
          <span className="criteria-sum-label">Add up (criteria)</span>
          <span className="criteria-sum-formula">{additionLine}</span>
          <span className="criteria-sum-totals">{totalsLine}</span>
        </div>
      </div>

      {/* Strengths */}
      <div className="result-section">
        <div className="result-section-header">
          <span className="result-section-dot green" />
          <h3>Strengths</h3>
        </div>
        <ul className="result-list strengths">
          {result.strengths.length > 0
            ? result.strengths.map((item, index) => (
                <li key={`strength-${index}`}>
                  <span className="result-list-icon">✓</span>
                  {item}
                </li>
              ))
            : <li><span className="result-list-icon">—</span>None noted.</li>
          }
        </ul>
      </div>

      {/* Major issues */}
      <div className="result-section">
        <div className="result-section-header">
          <span className="result-section-dot red" />
          <h3>Major Issues</h3>
        </div>
        <ul className="result-list issues">
          {result.bugs.length > 0
            ? result.bugs.map((item, index) => (
                <li key={`bug-${index}`}>
                  <span className="result-list-icon">✗</span>
                  {item}
                </li>
              ))
            : <li><span className="result-list-icon">—</span>No major issues found.</li>
          }
        </ul>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="result-section">
          <div className="result-section-header">
            <span className="result-section-dot blue" />
            <h3>Suggestions</h3>
          </div>
          <ul className="result-list suggestions">
            {suggestions.map((item, index) => (
              <li key={`suggestion-${index}`}>
                <span className="result-list-icon">→</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Final feedback */}
      <div className="result-section">
        <div className="result-section-header">
          <span className="result-section-dot gray" />
          <h3>Final Feedback</h3>
        </div>
        <div className="feedback-card">{result.feedback}</div>
      </div>

      {/* Student Code (collapsible) */}
      {studentCode && (
        <div className="result-section">
          <div
            className="result-section-header"
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => setCodeExpanded((v) => !v)}
          >
            <span className="result-section-dot gray" />
            <h3>Student Code</h3>
            <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 600 }}>
              {codeExpanded ? "▲ Collapse" : "▼ Expand"}
            </span>
          </div>
          {codeExpanded && (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ position: "absolute", top: "8px", right: "8px", fontSize: "11px", padding: "3px 8px", zIndex: 1 }}
                onClick={() => copyText(studentCode, "Copied code")}
              >
                Copy
              </button>
              <pre className="student-code-block">{studentCode}</pre>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default ResultPanel;
