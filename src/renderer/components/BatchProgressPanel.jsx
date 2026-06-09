import { useMemo, useState } from "react";
import { averageScore, queueCounts } from "../services/batchSessionService";

function formatIsoTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function statusChipClass(status) {
  if (status === "Done") return "status-chip status-done";
  if (status === "Error") return "status-chip status-error";
  if (status === "Grading") return "status-chip status-grading";
  if (status === "Queued") return "status-chip status-queued";
  return "status-chip status-not-started";
}

/* ── Stat tile ── */
function StatTile({ label, value, accent }) {
  return (
    <div className="bps-stat-tile">
      <span className="bps-stat-value" style={accent ? { color: accent } : undefined}>{value}</span>
      <span className="bps-stat-label">{label}</span>
    </div>
  );
}

/* ── Action group ── */
function ActionGroup({ label, children }) {
  return (
    <div className="bps-action-group">
      <span className="bps-action-group-label">{label}</span>
      <div className="bps-action-row">{children}</div>
    </div>
  );
}

function BatchProgressPanel({
  session,
  onDeleteResult,
  onRequeueStudent,
  onExportSimpleCsv,
  onExportDetailedCsv,
  onExportTeachingReport,
  onClearBatch,
  onStartNewBatch,
  onStartQueue,
  onPauseQueue,
  onResumeQueue,
  onRetryErrorItems,
  onClearCompleted,
  costSummary = {
    usageAvailable: false,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costAvailable: false,
    totalCost: 0
  }
}) {
  const [expandedStudentName, setExpandedStudentName] = useState("");
  const avgPercent = useMemo(() => Math.round(averageScore(session) * 100), [session]);
  const counts = useMemo(() => queueCounts(session), [session]);

  if (!session) return null;

  const avgColor =
    avgPercent >= 80 ? "var(--green)" :
    avgPercent >= 50 ? "var(--amber)" :
    "var(--red)";

  return (
    <div className="bps-root">

      {/* ══════════════════════════════════════════
          SECTION 1 — BATCH HEADER
          ══════════════════════════════════════════ */}
      <div className="bps-header-card">
        <div className="bps-header-top">
          <div className="bps-header-identity">
            <span className="bps-session-name">{session.batchSessionName}</span>
            <span className="bps-session-meta">
              {[session.className, session.language, session.strictness].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div className="bps-avg-badge" style={{ color: avgColor }}>
            <span className="bps-avg-value">{avgPercent}%</span>
            <span className="bps-avg-label">avg</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          SECTION 2 — SESSION STATS
          ══════════════════════════════════════════ */}
      <div className="bps-stats-card">
        <div className="bps-stats-label-row">
          <span className="bps-section-label">Session Stats</span>
        </div>
        <div className="bps-stat-grid">
          <StatTile label="Done"    value={counts.done}    accent="var(--green)" />
          <StatTile label="Queued"  value={counts.queued}  accent="var(--amber)" />
          <StatTile label="Grading" value={counts.grading} accent="var(--blue)"  />
          <StatTile label="Error"   value={counts.error}   accent="var(--red)"   />
          {costSummary.usageAvailable && (
            <StatTile label="Tokens" value={costSummary.totalTokens.toLocaleString()} />
          )}
          {costSummary.costAvailable && (
            <StatTile label="Cost" value={`$${costSummary.totalCost.toFixed(4)}`} />
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          SECTION 3 — ACTIONS
          ══════════════════════════════════════════ */}
      <div className="bps-actions-card">
        <span className="bps-section-label">Actions</span>

        {/* A. Queue Actions */}
        <ActionGroup label="Queue">
          <button type="button" className="btn-primary bps-btn" onClick={onStartQueue}>
            ▶ Start Queue
          </button>
          {session.queuePaused ? (
            <button type="button" className="btn-secondary bps-btn" onClick={onResumeQueue}>Resume</button>
          ) : (
            <button type="button" className="btn-secondary bps-btn" onClick={onPauseQueue}>Pause</button>
          )}
          <button type="button" className="btn-secondary bps-btn" onClick={onRetryErrorItems}>Retry Errors</button>
        </ActionGroup>

        <div className="bps-action-divider" />

        {/* B. Batch Actions */}
        <ActionGroup label="Batch">
          <button type="button" className="btn-secondary bps-btn" onClick={onClearCompleted}>Clear Done</button>
          <button type="button" className="btn-secondary bps-btn" onClick={onClearBatch}>Clear Batch</button>
          <button type="button" className="btn-secondary bps-btn btn-danger" onClick={onStartNewBatch}>New Batch</button>
        </ActionGroup>

        <div className="bps-action-divider" />

        {/* C. Export */}
        <div className="bps-action-group">
          <span className="bps-action-group-label">Export</span>
          <div className="bps-export-grid">
            <button type="button" className="btn-secondary bps-export-btn" onClick={onExportSimpleCsv}>
              <span className="bps-export-icon">⬇</span>
              <span className="bps-export-text">
                <span className="bps-export-title">Simple CSV</span>
                <span className="bps-export-desc">Scores &amp; feedback</span>
              </span>
            </button>
            <button type="button" className="btn-secondary bps-export-btn" onClick={onExportDetailedCsv}>
              <span className="bps-export-icon">⬇</span>
              <span className="bps-export-text">
                <span className="bps-export-title">Detailed CSV</span>
                <span className="bps-export-desc">Full data &amp; code</span>
              </span>
            </button>
            <button type="button" className="btn-secondary bps-export-btn bps-export-btn-wide" onClick={onExportTeachingReport}>
              <span className="bps-export-icon">📄</span>
              <span className="bps-export-text">
                <span className="bps-export-title">Teaching Report</span>
                <span className="bps-export-desc">Class summary (.html)</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          STUDENT LIST
          ══════════════════════════════════════════ */}
      <div className="bps-student-list-section">
        <span className="bps-section-label">
          Graded Students ({session.students.length})
        </span>

        {session.students.length === 0 ? (
          <div className="bps-empty-list">
            No graded students yet. Add students to the queue and start grading.
          </div>
        ) : (
          <div className="batch-list">
            {session.students.map((student) => {
              const expanded = expandedStudentName === student.studentName;
              const chipClass = statusChipClass(student.status || "Done");
              return (
                <div className="batch-row" key={student.studentName}>
                  <div className="batch-row-top">
                    <span className="batch-row-name">{student.studentName}</span>
                    <span className={chipClass}>{student.status || "Done"}</span>
                    {student.earnedScore !== "" && (
                      <span className="batch-row-score">{student.earnedScore}/{student.possibleScore}</span>
                    )}
                  </div>

                  {student.shortComment && (
                    <p className="batch-comment-preview">{student.shortComment}</p>
                  )}

                  <div style={{ padding: "0 12px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span className="hint-text">{formatIsoTime(student.timestamp)}</span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button type="button" className="btn-secondary" style={{ fontSize: "11px", padding: "4px 8px" }} onClick={() => setExpandedStudentName(expanded ? "" : student.studentName)}>
                        {expanded ? "Hide" : "Details"}
                      </button>
                      <button type="button" className="btn-secondary" style={{ fontSize: "11px", padding: "4px 8px" }} onClick={() => onRequeueStudent(student.studentName)}>
                        Requeue
                      </button>
                      <button type="button" className="btn-secondary btn-danger" style={{ fontSize: "11px", padding: "4px 8px" }} onClick={() => onDeleteResult(student.studentName)}>
                        Delete
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="batch-details">
                      <p style={{ marginBottom: "8px" }}>
                        <strong>Provider:</strong> {student.provider || "unknown"} / {student.model || "unknown"}
                      </p>
                      <p style={{ marginBottom: "8px" }}>
                        <strong>Usage:</strong>{" "}
                        {student.usage?.inputTokens != null
                          ? `${student.usage.inputTokens} in / ${student.usage.outputTokens ?? "?"} out / ${student.usage.totalTokens ?? "?"} total`
                          : "usage unavailable"}
                        {typeof student.usage?.estimatedCost === "number" && ` · $${student.usage.estimatedCost.toFixed(4)}`}
                      </p>
                      <p><strong>Final feedback:</strong></p>
                      <p style={{ marginBottom: "10px" }}>{student.result?.feedback || "—"}</p>

                      {(student.result?.strengths || []).length > 0 && (
                        <>
                          <p><strong>Strengths:</strong></p>
                          <ul>{(student.result.strengths).map((item, i) => <li key={i}>{item}</li>)}</ul>
                        </>
                      )}
                      {(student.result?.bugs || []).length > 0 && (
                        <>
                          <p><strong>Major issues:</strong></p>
                          <ul>{(student.result.bugs).map((item, i) => <li key={i}>{item}</li>)}</ul>
                        </>
                      )}
                      {(student.result?.suggestions || []).length > 0 && (
                        <>
                          <p><strong>Suggestions:</strong></p>
                          <ul>{(student.result.suggestions).map((item, i) => <li key={i}>{item}</li>)}</ul>
                        </>
                      )}
                      {(student.result?.criteria || []).length > 0 && (
                        <>
                          <p><strong>Criteria:</strong></p>
                          <ul>
                            {(student.result.criteria).map((criterion, i) => (
                              <li key={i}>{criterion.name}: {criterion.score}/{criterion.max_score} — {criterion.reason}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      <details style={{ marginTop: "8px" }}>
                        <summary style={{ cursor: "pointer", fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Original student code</summary>
                        <pre className="batch-student-code">{student.studentCode || ""}</pre>
                      </details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

export default BatchProgressPanel;
