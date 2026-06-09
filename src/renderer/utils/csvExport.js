/* ── CSV helpers ─────────────────────────────────────────── */
function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function slugify(value) {
  return (value || "batch")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sortStudents(session, rosterStudents = []) {
  const rosterIndex = new Map(
    (rosterStudents || []).map((student, index) => [String(student.id || ""), index])
  );
  return [...(session?.students || [])].sort((a, b) => {
    const ai = rosterIndex.has(String(a.id || ""))
      ? rosterIndex.get(String(a.id || ""))
      : Number.MAX_SAFE_INTEGER;
    const bi = rosterIndex.has(String(b.id || ""))
      ? rosterIndex.get(String(b.id || ""))
      : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return String(a.studentName || "").localeCompare(String(b.studentName || ""));
  });
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/* ── MODE 1: Simple CSV ──────────────────────────────────── */
export function exportSimpleCsv(session, rosterStudents = []) {
  const rows = sortStudents(session, rosterStudents);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const headers = [
    "Class",
    "Session Name",
    "Student",
    "Score Earned",
    "Score Possible",
    "Final Feedback",
    "Timestamp"
  ];
  const lines = [headers.join(",")];
  for (const student of rows) {
    lines.push(
      [
        session.className || "",
        session.batchSessionName || "",
        student.studentName || "",
        student.earnedScore ?? "",
        student.possibleScore ?? "",
        student.result?.feedback || "",
        student.timestamp || ""
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  triggerDownload(
    lines.join("\n"),
    `simple-${slugify(session.batchSessionName)}-${dateStamp}.csv`,
    "text/csv;charset=utf-8;"
  );
}

/* ── MODE 2: Detailed CSV ────────────────────────────────── */
export function exportDetailedCsv(session, rosterStudents = []) {
  const rows = sortStudents(session, rosterStudents);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const headers = [
    "Class",
    "Session Name",
    "Student",
    "Status",
    "Score Earned",
    "Score Possible",
    "Timestamp",
    "Strengths",
    "Major Issues",
    "Suggestions",
    "Final Feedback",
    "Criteria Breakdown",
    "Student Code",
    "Provider",
    "Model",
    "Input Tokens",
    "Output Tokens",
    "Total Tokens",
    "Estimated Cost"
  ];
  const lines = [headers.join(",")];
  for (const student of rows) {
    const r = student.result;
    const strengths = r?.strengths?.join(" | ") || "";
    const bugs = r?.bugs?.join(" | ") || "";
    const suggestions = r?.suggestions?.join(" | ") || "";
    const criteriaBreakdown = r?.criteria
      ? r.criteria.map((c) => `${c.name}: ${c.score}/${c.max_score} — ${c.reason}`).join(" || ")
      : "";
    lines.push(
      [
        session.className || "",
        session.batchSessionName || "",
        student.studentName || "",
        student.status || "Done",
        student.earnedScore ?? "",
        student.possibleScore ?? "",
        student.timestamp || "",
        strengths,
        bugs,
        suggestions,
        r?.feedback || "",
        criteriaBreakdown,
        student.studentCode || "",
        student.provider || "",
        student.model || "",
        student.usage?.inputTokens ?? "",
        student.usage?.outputTokens ?? "",
        student.usage?.totalTokens ?? "",
        student.usage?.estimatedCost ?? ""
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  triggerDownload(
    lines.join("\n"),
    `detailed-${slugify(session.batchSessionName)}-${dateStamp}.csv`,
    "text/csv;charset=utf-8;"
  );
}

/* ── MODE 3: Teaching Summary Report (.docx via HTML→Blob) ── */
export async function exportTeachingReport(session, rosterStudents = [], llmConfig = null) {
  const students = sortStudents(session, rosterStudents);
  const gradedStudents = students.filter((s) => s.status === "Done" && s.result);
  const dateStamp = new Date().toISOString().slice(0, 10);

  /* ── Aggregate structured data ── */
  const totalStudents = students.length;
  const gradedCount = gradedStudents.length;
  const scores = gradedStudents.map((s) => {
    const earned = typeof s.earnedScore === "number" ? s.earnedScore : Number(s.earnedScore) || 0;
    const possible = typeof s.possibleScore === "number" ? s.possibleScore : Number(s.possibleScore) || 0;
    return { name: s.studentName, earned, possible, pct: possible > 0 ? earned / possible : 0 };
  });
  const avgPct = scores.length > 0 ? scores.reduce((a, b) => a + b.pct, 0) / scores.length : 0;
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b.earned, 0) / scores.length : 0;

  /* Collect all strengths, bugs, suggestions across students */
  const allStrengths = gradedStudents.flatMap((s) => s.result?.strengths || []);
  const allBugs = gradedStudents.flatMap((s) => s.result?.bugs || []);
  const allSuggestions = gradedStudents.flatMap((s) => s.result?.suggestions || []);

  /* Criteria-level weakness: sum lost points per criterion name */
  const criteriaLoss = {};
  for (const student of gradedStudents) {
    for (const c of (student.result?.criteria || [])) {
      const loss = (c.max_score || 0) - (c.score || 0);
      if (!criteriaLoss[c.name]) criteriaLoss[c.name] = { name: c.name, totalLoss: 0, count: 0 };
      criteriaLoss[c.name].totalLoss += loss;
      criteriaLoss[c.name].count += 1;
    }
  }
  const topWeakCriteria = Object.values(criteriaLoss)
    .sort((a, b) => b.totalLoss - a.totalLoss)
    .slice(0, 5);

  /* Score distribution buckets */
  const buckets = { "90-100%": 0, "80-89%": 0, "70-79%": 0, "60-69%": 0, "Below 60%": 0 };
  for (const s of scores) {
    const p = s.pct * 100;
    if (p >= 90) buckets["90-100%"]++;
    else if (p >= 80) buckets["80-89%"]++;
    else if (p >= 70) buckets["70-79%"]++;
    else if (p >= 60) buckets["60-69%"]++;
    else buckets["Below 60%"]++;
  }

  /* ── Build structured summary for AI (or fallback) ── */
  const structuredSummary = {
    sessionName: session.batchSessionName,
    className: session.className,
    language: session.language,
    totalStudents,
    gradedCount,
    avgScorePercent: Math.round(avgPct * 100),
    avgScoreRaw: avgScore.toFixed(1),
    topStrengths: deduplicateAndRank(allStrengths).slice(0, 5),
    topWeaknesses: deduplicateAndRank(allBugs).slice(0, 5),
    topSuggestions: deduplicateAndRank(allSuggestions).slice(0, 5),
    criteriaWeaknesses: topWeakCriteria,
    scoreDistribution: buckets,
    studentScores: scores
  };

  /* ── Generate report text (AI if available, else structured fallback) ── */
  let reportHtml = "";
  if (llmConfig && llmConfig.apiKey) {
    try {
      reportHtml = await generateReportWithAI(structuredSummary, llmConfig);
    } catch (e) {
      console.warn("AI report generation failed, using structured fallback:", e);
      reportHtml = buildFallbackReportHtml(structuredSummary);
    }
  } else {
    reportHtml = buildFallbackReportHtml(structuredSummary);
  }

  /* ── Wrap in full HTML document and download ── */
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Teaching Summary Report — ${escapeHtml(session.batchSessionName)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 860px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.7; }
  h1 { font-size: 26px; font-weight: 800; margin-bottom: 4px; }
  h2 { font-size: 18px; font-weight: 700; margin-top: 32px; margin-bottom: 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
  h3 { font-size: 15px; font-weight: 700; margin-top: 20px; margin-bottom: 6px; }
  .meta { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
  .stat-row { display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0; }
  .stat-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 20px; min-width: 120px; }
  .stat-box .val { font-size: 24px; font-weight: 800; }
  .stat-box .lbl { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
  th { background: #f3f4f6; text-align: left; padding: 8px 12px; font-weight: 700; border: 1px solid #e5e7eb; }
  td { padding: 7px 12px; border: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  .footer { margin-top: 48px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
</style>
</head>
<body>
${reportHtml}
<div class="footer">Generated by Code Assignment Grader · ${dateStamp}</div>
</body>
</html>`;

  triggerDownload(
    fullHtml,
    `teaching-report-${slugify(session.batchSessionName)}-${dateStamp}.html`,
    "text/html;charset=utf-8;"
  );
}

/* ── Helpers ─────────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function deduplicateAndRank(items) {
  const freq = {};
  for (const item of items) {
    const key = String(item).trim().toLowerCase();
    if (!freq[key]) freq[key] = { text: String(item).trim(), count: 0 };
    freq[key].count++;
  }
  return Object.values(freq).sort((a, b) => b.count - a.count).map((x) => x.text);
}

function buildFallbackReportHtml(s) {
  const distRows = Object.entries(s.scoreDistribution)
    .map(([range, count]) => `<tr><td>${escapeHtml(range)}</td><td>${count}</td><td>${s.gradedCount > 0 ? Math.round((count / s.gradedCount) * 100) : 0}%</td></tr>`)
    .join("");

  const criteriaRows = s.criteriaWeaknesses
    .map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${c.totalLoss.toFixed(1)}</td><td>${c.count}</td></tr>`)
    .join("");

  const studentRows = s.studentScores
    .map((st) => `<tr><td>${escapeHtml(st.name)}</td><td>${st.earned}</td><td>${st.possible}</td><td>${Math.round(st.pct * 100)}%</td></tr>`)
    .join("");

  return `
<h1>Teaching Summary Report</h1>
<div class="meta">${escapeHtml(s.className)} · ${escapeHtml(s.sessionName)} · ${escapeHtml(s.language)}</div>

<h2>1. Session Overview</h2>
<div class="stat-row">
  <div class="stat-box"><div class="val">${s.totalStudents}</div><div class="lbl">Total Students</div></div>
  <div class="stat-box"><div class="val">${s.gradedCount}</div><div class="lbl">Graded</div></div>
  <div class="stat-box"><div class="val">${s.avgScorePercent}%</div><div class="lbl">Avg Score</div></div>
  <div class="stat-box"><div class="val">${s.avgScoreRaw}</div><div class="lbl">Avg Points</div></div>
</div>

<h2>2. Overall Performance Summary</h2>
<h3>General Strengths</h3>
<ul>${s.topStrengths.length ? s.topStrengths.map((x) => `<li>${escapeHtml(x)}</li>`).join("") : "<li>No common strengths identified.</li>"}</ul>
<h3>General Weaknesses</h3>
<ul>${s.topWeaknesses.length ? s.topWeaknesses.map((x) => `<li>${escapeHtml(x)}</li>`).join("") : "<li>No common weaknesses identified.</li>"}</ul>

<h2>3. Common Mistakes</h2>
<ul>${s.topWeaknesses.length ? s.topWeaknesses.map((x) => `<li>${escapeHtml(x)}</li>`).join("") : "<li>No repeated issues detected.</li>"}</ul>

<h2>4. Criteria-Level Weaknesses</h2>
${criteriaRows ? `<table><thead><tr><th>Criterion</th><th>Total Points Lost</th><th>Students Affected</th></tr></thead><tbody>${criteriaRows}</tbody></table>` : "<p>No criteria data available.</p>"}

<h2>5. Teaching Suggestions</h2>
<ul>${s.topSuggestions.length ? s.topSuggestions.map((x) => `<li>${escapeHtml(x)}</li>`).join("") : "<li>Review areas with the highest point loss in criteria breakdown above.</li>"}</ul>

<h2>6. Score Distribution</h2>
<table><thead><tr><th>Range</th><th>Students</th><th>Percentage</th></tr></thead><tbody>${distRows}</tbody></table>

<h2>Appendix — Individual Scores</h2>
<table><thead><tr><th>Student</th><th>Earned</th><th>Possible</th><th>Percentage</th></tr></thead><tbody>${studentRows}</tbody></table>
`;
}

async function generateReportWithAI(s, llmConfig) {
  const { OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: llmConfig.apiKey,
    baseURL: llmConfig.baseUrl,
    dangerouslyAllowBrowser: true,
    timeout: 120000
  });

  const prompt = `You are an experienced educator writing a professional teaching summary report.

Based on the following structured class performance data, generate a comprehensive HTML report body (no <html>/<head>/<body> tags — just the inner content starting with <h1>).

Use the provided CSS classes: stat-row, stat-box, h1, h2, h3, ul, li, table, th, td.

Data:
${JSON.stringify(s, null, 2)}

The report should include:
1. Session Overview (with stat boxes for key numbers)
2. Overall Performance Summary (general strengths and weaknesses in professional language)
3. Common Mistakes (patterns observed across students)
4. Criteria-Level Weaknesses (which rubric areas caused the most point loss)
5. Teaching Suggestions (actionable recommendations for the teacher)
6. Score Distribution table

Write in a professional, educator-facing tone. Be specific and actionable. Use HTML formatting only.`;

  let rawText = "";
  try {
    const response = await client.responses.create({
      model: llmConfig.model,
      input: prompt
    });
    rawText = response.output_text || "";
  } catch {
    const response = await client.chat.completions.create({
      model: llmConfig.model,
      messages: [{ role: "user", content: prompt }]
    });
    rawText = response.choices?.[0]?.message?.content || "";
  }

  /* Strip markdown code fences if present */
  return rawText
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/* ── Legacy export (backward compat) ────────────────────── */
export function exportBatchToCsv(session, rosterStudents = []) {
  exportSimpleCsv(session, rosterStudents);
}
