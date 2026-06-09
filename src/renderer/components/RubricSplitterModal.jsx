import { useEffect, useState } from "react";
import { splitAndRefineRubric } from "../services/openaiService";

const RUBRIC_HINT_RE =
  /(?:\b\d+\s*分\b|为\s*\d+\s*分|return\s*为?\s*\d+\s*分|concatenation|打印|评分|得分|分值|points?\b|rubric)/i;

const PYTHON_CODE_RE =
  /^\s*(def\b|class\b|return\b|print\(|if\b|for\b|while\b|elif\b|else:|try:|except\b|with\b|import\b|from\b|pass\b|break\b|continue\b|[A-Za-z_]\w*\s*=|.*input\(|.*int\(|.*str\(|.*len\(|.*\)\s*:)/;

const RUBRIC_ONLY_COMMENT_RE =
  /^\s*(#|\/\/)\s*(?:\d+\s*分|第?\s*\d+\s*项|评分|得分|分值|rubric|criteria|input\s*\d*分|def\s*\d*分|return\s*\d*分|打印\s*\d*分)/i;

function normalizeRubricLines(lines) {
  const unique = [];
  const seen = new Set();
  for (const raw of lines) {
    const item = raw.trim();
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    unique.push(`- ${item}`);
  }
  return unique.join("\n");
}

function titleForKeyword(keyword) {
  const key = (keyword || "").toLowerCase().trim();
  if (!key) return "Criterion";
  if (/input/.test(key)) return "Input collection for required variables";
  if (/def|function/.test(key)) return "Function definition";
  if (/return/.test(key)) return "Return statement";
  if (/concat|string/.test(key)) return "String construction/concatenation";
  if (/print/.test(key)) return "Printing the result";
  if (/total|add|sum|cost/.test(key)) return "Total cost calculation";
  return keyword.trim();
}

function inferCriterionFromCode(codePart, pointText) {
  const points = Number(pointText);
  if (!Number.isFinite(points)) return `${pointText}分`;
  const code = (codePart || "").trim();
  if (/^\s*print\(/.test(code)) return `Printing the result ${points}分`;
  if (/^\s*return\b/.test(code)) return `Return statement ${points}分`;
  if (/=\s*cost1\s*\+\s*cost2|total\s*=/.test(code)) return `Total cost calculation ${points}分`;
  if (/def\s+\w+\(/.test(code)) return `Function definition ${points}分`;
  return `${points}分`;
}

function splitMixedText(mixedText) {
  const rubricLines = [];
  const sampleLines = [];
  const lines = mixedText.split("\n");

  for (const originalLine of lines) {
    const line = originalLine ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      sampleLines.push("");
      continue;
    }

    const isLikelyCode = PYTHON_CODE_RE.test(trimmed);
    const hasRubricHint = RUBRIC_HINT_RE.test(trimmed);

    const hashIndex = line.indexOf("#");
    const slashIndex = line.indexOf("//");
    const commentIndex = hashIndex >= 0 ? hashIndex : slashIndex;

    if (isLikelyCode && commentIndex > -1) {
      const codePart = line.slice(0, commentIndex).replace(/\s+$/, "");
      const commentPart = line.slice(commentIndex + (hashIndex >= 0 ? 1 : 2)).trim();
      if (codePart) {
        sampleLines.push(codePart);
      }
      if (commentPart && RUBRIC_HINT_RE.test(commentPart)) {
        const pointOnly = commentPart.match(/^(\d+(?:\.\d+)?)\s*分$/);
        rubricLines.push(
          pointOnly ? inferCriterionFromCode(codePart, pointOnly[1]) : commentPart
        );
      }
      continue;
    }

    if (isLikelyCode && hasRubricHint) {
      const parenNote = trimmed.match(/[（(][^()（）]*分[^()（）]*[）)]/);
      if (parenNote) {
        rubricLines.push(parenNote[0]);
        const cleaned = line.replace(parenNote[0], "").replace(/\s+$/, "");
        sampleLines.push(cleaned);
        continue;
      }
      sampleLines.push(line);
      continue;
    }

    if (isLikelyCode) {
      sampleLines.push(line);
      continue;
    }

    if (hasRubricHint) {
      rubricLines.push(trimmed);
    } else {
      rubricLines.push(trimmed);
    }
  }

  return {
    rubric: normalizeRubricLines(rubricLines),
    sampleAnswer: sampleLines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  };
}

function sanitizeSampleAnswer(rawSample) {
  const lines = (rawSample || "").split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (RUBRIC_ONLY_COMMENT_RE.test(trimmed)) return false;
    return true;
  });
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeRubricOutput(rawRubric, totalScore) {
  const text = (rawRubric || "").trim();
  if (!text) return "";

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";

  const pointRe = /(\d+(?:\.\d+)?)\s*(?:points?|pts?|分)\b/i;
  const totalLineRe = /^total\s*score\s*[:：]\s*\d+(?:\.\d+)?$/i;
  const subPointRe = /([A-Za-z_][A-Za-z0-9_\s/-]{1,40})\s*(\d+(?:\.\d+)?)\s*分/gi;
  const normalized = [];
  const criteria = [];
  const seenCriterionKey = new Set();
  function pushCriterion(name, points, itemHint = "") {
    const cleanName = titleForKeyword(name).replace(/^[:：\-\s]+/, "").trim();
    if (!cleanName) return;
    const key = `${cleanName.toLowerCase()}::${points}`;
    if (seenCriterionKey.has(key)) return;
    seenCriterionKey.add(key);
    criteria.push({
      name: cleanName,
      points: `${points} points`,
      items: itemHint ? [itemHint] : []
    });
  }
  let current = null;
  const addCurrent = () => {
    if (current) criteria.push(current);
    current = null;
  };

  for (const line of lines) {
    const cleaned = line.replace(/^[-*•]\s*/, "").trim();
    if (!cleaned) continue;
    if (totalLineRe.test(cleaned)) {
      continue;
    }
    if (PYTHON_CODE_RE.test(cleaned)) {
      continue;
    }

    // Handle patterns like "2分（return 1分, concatenation 1分）"
    if (/^\d+(?:\.\d+)?\s*分/.test(cleaned) && /[()（）]/.test(cleaned)) {
      const allSub = [...cleaned.matchAll(subPointRe)];
      if (allSub.length) {
        allSub.forEach((m) => pushCriterion(m[1], Number(m[2])));
        continue;
      }
    }

    // Handle simple "keyword 4分" style.
    const zhMatch = cleaned.match(/^(.+?)\s*(\d+(?:\.\d+)?)\s*分$/i);
    if (zhMatch) {
      pushCriterion(zhMatch[1], Number(zhMatch[2]));
      continue;
    }

    const pointMatch = cleaned.match(pointRe);
    const looksLikeHeader =
      pointMatch && !/^(e\.g\.|for example|example|such as)\b/i.test(cleaned);

    if (looksLikeHeader) {
      addCurrent();
      const pointsText = pointMatch[0];
      const name = cleaned
        .replace(pointRe, "")
        .replace(/[—:-]\s*$/, "")
        .trim();
      current = {
        name: name || "Criterion",
        points: pointsText,
        items: []
      };
      continue;
    }

    if (!current) {
      current = {
        name: "General requirements",
        points: "",
        items: []
      };
    }
    current.items.push(cleaned);
  }
  addCurrent();

  if (totalScore && !Number.isNaN(Number(totalScore))) {
    normalized.push(`Total score: ${totalScore}`);
    normalized.push("");
  }

  const filteredCriteria = criteria.filter((criterion) => {
    if (criterion.points) return true;
    if (!criterion.items.length) return false;
    // Skip generic non-scoring heading buckets from model verbosity.
    if (/^general requirements$/i.test(criterion.name.trim())) return false;
    return true;
  });

  function parsePoints(pointsText) {
    const parsed = Number(String(pointsText).match(/(\d+(?:\.\d+)?)/)?.[1]);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function reconcileCriteriaToTotal(sourceCriteria, targetTotal) {
    if (!Number.isFinite(targetTotal) || targetTotal <= 0) return sourceCriteria;
    const withMeta = sourceCriteria.map((criterion) => ({
      ...criterion,
      numericPoints: parsePoints(criterion.points)
    }));
    let sum = withMeta.reduce((acc, c) => acc + c.numericPoints, 0);
    if (Math.abs(sum - targetTotal) < 0.001) return withMeta;

    // When over total, remove likely duplicate umbrella criteria first.
    if (sum > targetTotal) {
      const hasReturn = withMeta.some((c) => /return statement/i.test(c.name));
      const hasConcat = withMeta.some((c) => /concatenation|string construction/i.test(c.name));
      let working = [...withMeta];

      if (hasReturn && hasConcat) {
        working = working.filter((c) => {
          const lower = c.name.toLowerCase();
          const isUmbrella =
            /formatted|result string|includes both item names/i.test(lower) &&
            /return|concatenation|string/i.test(lower);
          return !isUmbrella;
        });
      }

      sum = working.reduce((acc, c) => acc + c.numericPoints, 0);
      if (sum <= targetTotal + 0.001) return working;

      // Fallback: trim lowest-confidence generic criteria until total fits.
      const ranked = [...working].sort((a, b) => {
        const aGeneric = /evaluate based on rubric requirements/i.test(a.items?.[0] || "") ? 1 : 0;
        const bGeneric = /evaluate based on rubric requirements/i.test(b.items?.[0] || "") ? 1 : 0;
        if (aGeneric !== bGeneric) return bGeneric - aGeneric;
        return b.numericPoints - a.numericPoints;
      });
      const keep = [];
      let running = 0;
      ranked.forEach((c) => {
        if (running + c.numericPoints <= targetTotal + 0.001) {
          keep.push(c);
          running += c.numericPoints;
        }
      });
      // Preserve original display ordering.
      return working.filter((w) => keep.includes(w));
    }

    // When under total, keep criteria as-is; teacher can top up manually.
    return withMeta;
  }

  const targetTotal =
    totalScore && !Number.isNaN(Number(totalScore)) ? Number(totalScore) : null;
  const reconciledCriteria = reconcileCriteriaToTotal(filteredCriteria, targetTotal);

  reconciledCriteria.forEach((criterion, index) => {
    const header = criterion.points
      ? `${index + 1}. ${criterion.name} — ${criterion.points}`
      : `${index + 1}. ${criterion.name}`;
    normalized.push(header);
    if (!criterion.items.length) {
      normalized.push("   - Evaluate based on rubric requirements.");
    } else {
      criterion.items.forEach((item) => normalized.push(`   - ${item}`));
    }
    if (index < reconciledCriteria.length - 1) {
      normalized.push("");
    }
  });

  return normalized.join("\n").trim();
}

function hasDetailedCriteria(rubricText) {
  const lines = (rubricText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const criterionLines = lines.filter(
    (line) =>
      !/^total\s*score\s*[:：]/i.test(line) &&
      !line.startsWith("-") &&
      /^\d+\./.test(line)
  );
  return criterionLines.length >= 2;
}

function RubricSplitterModal({
  isOpen,
  onClose,
  onUseInGrader,
  seedText,
  llmConfig,
  modelOptions = []
}) {
  const [mixedText, setMixedText] = useState("");
  const [rubricText, setRubricText] = useState("");
  const [sampleText, setSampleText] = useState("");
  const [status, setStatus] = useState("");
  const [splitError, setSplitError] = useState("");
  const [aiSplitting, setAiSplitting] = useState(false);
  const [questionTotalScore, setQuestionTotalScore] = useState("");
  const [splitModel, setSplitModel] = useState(llmConfig?.model || "");

  useEffect(() => {
    if (isOpen) {
      setMixedText(seedText || "");
      setRubricText("");
      setSampleText("");
      setStatus("");
      setSplitError("");
      setAiSplitting(false);
      setQuestionTotalScore("");
      setSplitModel(llmConfig?.model || "");
    }
  }, [isOpen, seedText, llmConfig?.model]);

  if (!isOpen) return null;

  async function copyText(value, message) {
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
      setStatus(message);
      window.setTimeout(() => setStatus(""), 1300);
    } catch (_err) {
      setStatus("Copy failed");
      window.setTimeout(() => setStatus(""), 1600);
    }
  }

  async function handleAutoSplit() {
    if (!mixedText.trim()) {
      setSplitError("Please paste mixed content first.");
      return;
    }

    setSplitError("");
    setAiSplitting(true);
    try {
      const output = await splitAndRefineRubric({
        mixedText,
        totalScore: questionTotalScore.trim(),
        llmConfig: {
          ...llmConfig,
          model: splitModel || llmConfig?.model
        }
      });
      const normalizedAiRubric = normalizeRubricOutput(output.rubric, questionTotalScore.trim());
      if (hasDetailedCriteria(normalizedAiRubric)) {
        setRubricText(normalizedAiRubric);
      } else {
        // AI occasionally returns only total score or overly generic rubric.
        // Recover by extracting criterion hints from mixed text directly.
        const quickOutput = splitMixedText(mixedText);
        const recoveredRubric = normalizeRubricOutput(
          quickOutput.rubric,
          questionTotalScore.trim()
        );
        setRubricText(recoveredRubric || normalizedAiRubric);
      }
      setSampleText(sanitizeSampleAnswer(output.sampleAnswer));
      setStatus("AI split complete");
      window.setTimeout(() => setStatus(""), 1400);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI split failed.";
      setSplitError(message);
    } finally {
      setAiSplitting(false);
    }
  }

  function handleQuickSplit() {
    if (!mixedText.trim()) {
      setSplitError("Please paste mixed content first.");
      return;
    }

    const output = splitMixedText(mixedText);
    const quickRubric = normalizeRubricOutput(output.rubric, questionTotalScore.trim());
    setRubricText(quickRubric);
    setSampleText(sanitizeSampleAnswer(output.sampleAnswer));
    setSplitError("");
    setStatus("Quick split complete");
    window.setTimeout(() => setStatus(""), 1200);
  }

  function handleClear() {
    setMixedText("");
    setRubricText("");
    setSampleText("");
    setStatus("");
    setSplitError("");
    setQuestionTotalScore("");
  }

  function handleUseInGrader() {
    onUseInGrader({ rubric: rubricText, sampleAnswer: sampleText });
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Rubric Splitter">
      <div className="modal-card rubric-splitter-modal">
        <div className="modal-header">
          <h2>Rubric Splitter</h2>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="splitter-grid">
          <div className="splitter-col">
            <label htmlFor="mixedText">Mixed Rubric + Sample Answer</label>
            <div className="field-inline">
              <label htmlFor="splitModel">Rubric split model</label>
              <select
                id="splitModel"
                value={splitModel}
                onChange={(event) => setSplitModel(event.target.value)}
                disabled={aiSplitting}
              >
                {(modelOptions.length ? modelOptions : [llmConfig?.model || ""]).map((modelName) => (
                  <option key={modelName} value={modelName}>
                    {modelName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-inline">
              <label htmlFor="questionTotalScore">Question Total Score (optional)</label>
              <input
                id="questionTotalScore"
                type="number"
                min="0"
                step="0.5"
                value={questionTotalScore}
                onChange={(event) => setQuestionTotalScore(event.target.value)}
                placeholder="e.g. 10"
              />
            </div>
            <textarea
              id="mixedText"
              value={mixedText}
              onChange={(event) => setMixedText(event.target.value)}
              rows={22}
              placeholder="Paste mixed code + grading notes here..."
            />
          </div>

          <div className="splitter-col splitter-right">
            <div className="splitter-right-pane">
              <label htmlFor="rubricOut">Rubric</label>
              <textarea
                id="rubricOut"
                value={rubricText}
                onChange={(event) => setRubricText(event.target.value)}
                rows={10}
                placeholder="Rubric output..."
              />
            </div>
            <div className="splitter-right-pane">
              <label htmlFor="sampleOut">Sample Answer</label>
              <textarea
                id="sampleOut"
                className="code-textarea"
                value={sampleText}
                onChange={(event) => setSampleText(event.target.value)}
                rows={10}
                placeholder="Sample answer output..."
              />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={handleAutoSplit} disabled={aiSplitting}>
            {aiSplitting ? "AI Splitting..." : "Auto Split (AI)"}
          </button>
          <button type="button" className="btn-secondary" onClick={handleQuickSplit} disabled={aiSplitting}>
            Quick Split (Rule-based)
          </button>
          <button type="button" className="btn-secondary" onClick={handleClear}>
            Clear
          </button>
          <button type="button" className="btn-secondary" onClick={() => copyText(rubricText, "Copied rubric")}>
            Copy Rubric
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => copyText(sampleText, "Copied sample answer")}
          >
            Copy Sample Answer
          </button>
          <button type="button" className="btn-primary" onClick={handleUseInGrader}>
            Use in Grader
          </button>
          {status ? <span className="copy-status">{status}</span> : null}
        </div>
        {splitError ? <p className="error-message">{splitError}</p> : null}
      </div>
    </div>
  );
}

export default RubricSplitterModal;
