import { useEffect, useMemo, useRef, useState } from "react";
import LanguageSelector from "./components/LanguageSelector";
import StrictnessSelector from "./components/StrictnessSelector";
import QuestionInput from "./components/QuestionInput";
import CodeInput from "./components/CodeInput";
import RubricInput from "./components/RubricInput";
import SampleAnswerInput from "./components/SampleAnswerInput";
import RubricSplitterModal from "./components/RubricSplitterModal";
import GlobalRubricAssistantModal from "./components/GlobalRubricAssistantModal";
import BatchModeSwitch from "./components/BatchModeSwitch";
import BatchProgressPanel from "./components/BatchProgressPanel";
import GradeButton from "./components/GradeButton";
import ResultPanel from "./components/ResultPanel";
import {
  gradeAssignment,
  gradeAssignmentWithMeta,
  testProviderConnection,
  parseModelJson
} from "./services/openaiService";
import {
  clearCurrentBatchSession,
  clearStudentsInBatchSession,
  createBatchSession,
  loadCurrentBatchSession,
  saveCurrentBatchSession,
  upsertStudentInBatchSession,
  removeStudentFromBatchSession
} from "./services/batchSessionService";
import { exportSimpleCsv, exportDetailedCsv, exportTeachingReport } from "./utils/csvExport";
import {
  loadClasses,
  loadSelectedClassId,
  parseRosterPaste,
  saveClasses,
  saveSelectedClassId
} from "./services/classRosterService";

/* ── Constants ─────────────────────────────────────────────── */
const DEFAULT_PYTHON_GLOBAL_RUBRIC = `NO_PENALTY (default):
- Extraneous code with no side-effect (e.g., harmless checks, unused calculations).
- Minor spelling or capitalization differences when meaning is clear.
- Using slightly incorrect variable names when intent is unambiguous.
- Variable used without prior explicit explanation if context clearly defines it.
- Using reserved words incorrectly when intended variable meaning is obvious (e.g., 'list1' vs 'list').
- Using mathematical symbols instead of Python operators (x instead of *, / instead of ÷, <= instead of ≤, etc.) when intent is clear.
- Confusion between (), [], {} when the intended structure (function call, list, or grouping) is clear.
- Using '=' instead of '==' or vice versa when intent is clearly comparison or assignment.
- Confusion between len(), size, or length when referring to list or string length.
- Extra indexing symbols when referring to an entire list (e.g., unnecessary []).
- Using [i, j] instead of [i][j] for 2D lists when intent is clear.
- Incorrect or redundant list initialization if the intended structure is clear.
- Missing colon ':' after control statements (if, for, while) when structure clearly shows intent.
- Missing indentation where logical structure is still clear from context.
- Missing parentheses in function calls when clearly implied.
- Missing parentheses around conditions (Python does not require them, so no penalty).`;

const DEFAULT_JAVA_GLOBAL_RUBRIC = `NO_PENALTY (AP-style default):
- Do not penalize minor style differences (spacing, line breaks, brace placement) when logic is clear.
- Do not penalize equivalent control-flow structures that preserve behavior.
- Do not penalize different but valid variable names when intent is clear.
- Do not penalize harmless extra variables or intermediate steps with no side effects.
- Do not penalize omitted access modifiers when code intent remains clear in context.
- Do not penalize using equivalent loop forms (for, while, enhanced for) when rubric goal is met.
- Do not penalize equivalent String handling choices when output/behavior is correct.
- Do not penalize small syntax slips when intended Java construct is unambiguous.
- Do not penalize minor punctuation mistakes if the intended statement is obvious.
- Prioritize algorithm correctness and rubric criteria over formatting-only issues.`;

const DEFAULT_GLOBAL_RUBRIC_BY_LANGUAGE = {
  python: DEFAULT_PYTHON_GLOBAL_RUBRIC,
  java: DEFAULT_JAVA_GLOBAL_RUBRIC
};

const MODE_STORAGE_KEY = "grader_mode";
const PROVIDER_STORAGE_KEY = "grader_provider_config";

const PROVIDER_MODEL_OPTIONS = {
  openai: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"],
  kimi_cn: ["kimi-k2.5", "kimi-k2", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"]
};

const DEFAULT_PROVIDER_CONFIG = {
  activeProvider: "openai",
  openai: {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.4-mini"
  },
  kimi_cn: {
    apiKey: "",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-32k"
  }
};

const PRICING_TABLE = {
  openai: {
    "gpt-5.4": { inputPer1k: null, outputPer1k: null },
    "gpt-5.4-mini": { inputPer1k: null, outputPer1k: null },
    "gpt-5.4-nano": { inputPer1k: null, outputPer1k: null }
  },
  kimi_cn: {
    "moonshot-v1-128k": { inputPer1k: null, outputPer1k: null }
  }
};

function languageKey(language) {
  return language === "Java" ? "java" : "python";
}

/* ── Collapsible Section Card ─────────────────────────────── */
function SectionCard({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section-card">
      <div className="section-card-header" onClick={() => setOpen((v) => !v)}>
        <h2 className="section-card-title">{title}</h2>
        <span className={`section-card-chevron ${open ? "open" : ""}`}>▾</span>
      </div>
      {open && <div className="section-card-body">{children}</div>}
    </div>
  );
}

/* ── Workbench Card ───────────────────────────────────────── */
function WbCard({ title, headerRight, children }) {
  return (
    <div className="wb-card">
      <div className="wb-card-header">
        <span className="wb-card-title">{title}</span>
        {headerRight && <div style={{ flexShrink: 0 }}>{headerRight}</div>}
      </div>
      <div className="wb-card-body">{children}</div>
    </div>
  );
}

/* ── Status chip helper ───────────────────────────────────── */
function statusChipClass(status) {
  if (status === "Done") return "status-chip status-done";
  if (status === "Error") return "status-chip status-error";
  if (status === "Grading") return "status-chip status-grading";
  if (status === "Queued") return "status-chip status-queued";
  return "status-chip status-not-started";
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════ */
function App() {
  /* ── State ── */
  const [mode, setMode] = useState("single");
  const [language, setLanguage] = useState("Python");
  const [strictness, setStrictness] = useState("balanced");
  const [questions, setQuestions] = useState("");
  const [rubric, setRubric] = useState("");
  const [sampleAnswer, setSampleAnswer] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [providerConfig, setProviderConfig] = useState(DEFAULT_PROVIDER_CONFIG);
  const [showRubricSplitter, setShowRubricSplitter] = useState(false);
  const [globalRubric, setGlobalRubric] = useState(DEFAULT_GLOBAL_RUBRIC_BY_LANGUAGE);
  const [useGlobalRubric, setUseGlobalRubric] = useState(true);
  const [showGlobalRubricAssistant, setShowGlobalRubricAssistant] = useState(false);
  const [batchSessionName, setBatchSessionName] = useState("");
  const [activeBatchSession, setActiveBatchSession] = useState(null);
  const [batchStudentCode, setBatchStudentCode] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batchCurrentResult, setBatchCurrentResult] = useState(null);
  const [providerTestStatus, setProviderTestStatus] = useState("");
  const [providerTesting, setProviderTesting] = useState(false);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [rosterPasteText, setRosterPasteText] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const processingRef = useRef(false);

  /* ── Init ── */
  useEffect(() => {
    const savedProviderRaw = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
    const savedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
    const savedUseGlobalRubric = window.localStorage.getItem("grader_use_global_rubric");
    const savedGlobalRubricRaw = window.localStorage.getItem("grader_global_rubric");
    let savedGlobalRubric = DEFAULT_GLOBAL_RUBRIC_BY_LANGUAGE;
    if (savedGlobalRubricRaw !== null) {
      try {
        const parsed = JSON.parse(savedGlobalRubricRaw);
        if (parsed && typeof parsed === "object") {
          const python = typeof parsed.python === "string" ? parsed.python : DEFAULT_PYTHON_GLOBAL_RUBRIC;
          const java = typeof parsed.java === "string" ? parsed.java : DEFAULT_JAVA_GLOBAL_RUBRIC;
          savedGlobalRubric = { python, java };
        } else if (typeof parsed === "string") {
          savedGlobalRubric = { python: parsed, java: DEFAULT_JAVA_GLOBAL_RUBRIC };
        }
      } catch {
        savedGlobalRubric = { python: savedGlobalRubricRaw, java: DEFAULT_JAVA_GLOBAL_RUBRIC };
      }
    }
    if (savedProviderRaw) {
      try {
        const parsed = JSON.parse(savedProviderRaw);
        if (parsed && typeof parsed === "object") {
          setProviderConfig({
            ...DEFAULT_PROVIDER_CONFIG,
            ...parsed,
            openai: { ...DEFAULT_PROVIDER_CONFIG.openai, ...(parsed.openai || {}) },
            kimi_cn: { ...DEFAULT_PROVIDER_CONFIG.kimi_cn, ...(parsed.kimi_cn || {}) }
          });
        }
      } catch {
        setProviderConfig(DEFAULT_PROVIDER_CONFIG);
      }
    }
    setMode(savedMode === "batch" ? "batch" : "single");
    setUseGlobalRubric(savedUseGlobalRubric === null ? true : savedUseGlobalRubric === "true");
    setGlobalRubric(savedGlobalRubric);
    window.localStorage.setItem("grader_global_rubric", JSON.stringify(savedGlobalRubric));
    const loadedClasses = loadClasses();
    setClasses(loadedClasses);
    const restoredClassId = loadSelectedClassId();
    setSelectedClassId(restoredClassId);
    const savedBatchSession = loadCurrentBatchSession();
    if (savedBatchSession) {
      const migratedStudents = (savedBatchSession.students || []).map((student) => ({
        ...student,
        id: student.id || student.studentId || `student-${Math.random().toString(36).slice(2, 10)}`
      }));
      const migratedQueueItems = (savedBatchSession.queueItems || []).map((item) => ({
        ...item,
        id: item.id || item.studentId || `student-${Math.random().toString(36).slice(2, 10)}`
      }));
      const safeRestoredSession = {
        ...savedBatchSession,
        students: migratedStudents,
        queueItems: migratedQueueItems,
        queuePaused: true
      };
      setActiveBatchSession(safeRestoredSession);
      setBatchSessionName(savedBatchSession.batchSessionName || "");
      saveCurrentBatchSession(safeRestoredSession);
    }
  }, []);

  /* ── Derived ── */
  const canGrade = useMemo(() => {
    return !loading && questions.trim().length > 0 && rubric.trim().length > 0 && code.trim().length > 0;
  }, [loading, questions, rubric, code]);

  /* ── Provider helpers ── */
  function handleProviderFieldChange(provider, field, value) {
    setProviderConfig((prev) => {
      const next = { ...prev, [provider]: { ...prev[provider], [field]: value } };
      window.localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleActiveProviderChange(provider) {
    setProviderConfig((prev) => {
      const next = { ...prev, activeProvider: provider };
      window.localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function getActiveLlmConfig() {
    const active = providerConfig.activeProvider || "openai";
    const cfg = providerConfig[active] || DEFAULT_PROVIDER_CONFIG[active];
    return {
      provider: active,
      apiKey: cfg.apiKey || "",
      baseUrl: cfg.baseUrl || DEFAULT_PROVIDER_CONFIG[active].baseUrl,
      model: cfg.model || DEFAULT_PROVIDER_CONFIG[active].model
    };
  }

  function getLlmConfigForProvider(provider, modelOverride, baseUrlOverride) {
    const resolvedProvider = provider || providerConfig.activeProvider || "openai";
    const cfg = providerConfig[resolvedProvider] || DEFAULT_PROVIDER_CONFIG[resolvedProvider];
    return {
      provider: resolvedProvider,
      apiKey: cfg.apiKey || "",
      baseUrl: baseUrlOverride || cfg.baseUrl || DEFAULT_PROVIDER_CONFIG[resolvedProvider].baseUrl,
      model: modelOverride || cfg.model || DEFAULT_PROVIDER_CONFIG[resolvedProvider].model
    };
  }

  async function handleTestProviderConnection() {
    setProviderTesting(true);
    setProviderTestStatus("");
    try {
      const result = await testProviderConnection({ llmConfig: getActiveLlmConfig() });
      if (result.ok) {
        setProviderTestStatus(`Connected: ${result.provider} / ${result.model} (${result.latencyMs}ms)`);
      } else {
        setProviderTestStatus(`Connected but unexpected response: ${result.rawText.slice(0, 80)}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed.";
      setProviderTestStatus(`Connection failed: ${message}`);
    } finally {
      setProviderTesting(false);
    }
  }

  /* ── Rubric helpers ── */
  function handleUseSplitContent({ rubric: nextRubric, sampleAnswer: nextSample }) {
    setRubric(nextRubric);
    setSampleAnswer(nextSample);
  }

  function handleGlobalRubricChange(value) {
    const key = languageKey(language);
    setGlobalRubric((prev) => {
      const next = { ...prev, [key]: value };
      window.localStorage.setItem("grader_global_rubric", JSON.stringify(next));
      return next;
    });
  }

  function handleUseGlobalRubricToggle() {
    setUseGlobalRubric((prev) => {
      const next = !prev;
      window.localStorage.setItem("grader_use_global_rubric", String(next));
      return next;
    });
  }

  /* ── Session helpers ── */
  function updateActiveBatchSession(nextSession) {
    setActiveBatchSession(nextSession);
    if (nextSession) {
      saveCurrentBatchSession(nextSession);
    } else {
      clearCurrentBatchSession();
    }
  }

  function handleModeChange(nextMode) {
    setMode(nextMode);
    window.localStorage.setItem(MODE_STORAGE_KEY, nextMode);
  }

  /* ── Result normalization ── */
  function normalizeAndValidateResult(rawResponse) {
    const parsed = parseModelJson(rawResponse);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.total_score !== "number" ||
      !Array.isArray(parsed.criteria) ||
      !Array.isArray(parsed.strengths) ||
      !Array.isArray(parsed.bugs) ||
      (parsed.suggestions !== undefined && !Array.isArray(parsed.suggestions)) ||
      typeof parsed.feedback !== "string"
    ) {
      throw new Error("The model returned invalid grading JSON format.");
    }
    if (!Array.isArray(parsed.suggestions)) parsed.suggestions = [];
    const invalidCriterion = parsed.criteria.some(
      (c) => !c || typeof c.name !== "string" || typeof c.reason !== "string" || typeof c.score !== "number" || c.score < 0
    );
    if (invalidCriterion) {
      throw new Error("The model returned invalid criteria entries (need name, score, and reason).");
    }
    parsed.criteria = parsed.criteria.map((criterion) => {
      const rawMax = Number(criterion.max_score);
      const normalizedMax = Number.isFinite(rawMax) && rawMax >= 0 ? rawMax : criterion.score;
      return { ...criterion, max_score: normalizedMax < criterion.score ? criterion.score : normalizedMax };
    });
    const sumFromCriteria = parsed.criteria.reduce((acc, c) => acc + c.score, 0);
    parsed.total_max_score = parsed.criteria.reduce((acc, c) => acc + c.max_score, 0);
    if (sumFromCriteria !== parsed.total_score) {
      parsed.model_total_score_mismatch = parsed.total_score;
      parsed.total_score = sumFromCriteria;
    }
    return parsed;
  }

  function deriveShortComment(parsedResult) {
    if (Array.isArray(parsedResult.suggestions) && parsedResult.suggestions.length) {
      return parsedResult.suggestions[0];
    }
    if (Array.isArray(parsedResult.bugs) && parsedResult.bugs.length) {
      const topTwo = parsedResult.bugs.slice(0, 2).join("; ");
      return `Good attempt overall, but ${topTwo}`.slice(0, 200);
    }
    const feedback = (parsedResult.feedback || "").trim();
    if (!feedback) return "Solid submission with no major issues found.";
    const firstSentence = feedback.split(/(?<=[.!?])\s+/)[0] || feedback;
    return firstSentence.slice(0, 200);
  }

  function usageWithCost(usage, provider, model) {
    if (!usage) return null;
    const inputTokens = typeof usage.inputTokens === "number" ? usage.inputTokens : null;
    const outputTokens = typeof usage.outputTokens === "number" ? usage.outputTokens : null;
    const totalTokens = typeof usage.totalTokens === "number" ? usage.totalTokens : null;
    const pricing = PRICING_TABLE?.[provider]?.[model];
    let estimatedCost = null;
    if (inputTokens != null && outputTokens != null && pricing && typeof pricing.inputPer1k === "number" && typeof pricing.outputPer1k === "number") {
      estimatedCost = (inputTokens / 1000) * pricing.inputPer1k + (outputTokens / 1000) * pricing.outputPer1k;
    }
    return { inputTokens, outputTokens, totalTokens, estimatedCost };
  }

  function buildGlobalRulesText(config) {
    const key = languageKey(config.language);
    const selected = config.globalRubricByLanguage?.[key] || "";
    const normalized = config.globalRubricEnabled ? selected.trim() : "";
    return normalized ? `Teacher ${config.language} global rubric (enabled):\n${normalized}` : "";
  }

  /* ── Single grade ── */
  async function handleGrade() {
    setError("");
    setResult(null);
    if (!questions.trim() || !rubric.trim() || !code.trim()) {
      setError("Please provide assignment questions, rubric, and student code.");
      return;
    }
    setLoading(true);
    try {
      const selectedLanguageKey = languageKey(language);
      const selectedGlobalRubric = globalRubric[selectedLanguageKey] || "";
      const normalizedGlobalRubric = useGlobalRubric ? selectedGlobalRubric.trim() : "";
      const rawResponse = await gradeAssignment({
        language, strictness, questions, rubric, sampleAnswer, code,
        noPenaltyRules: [normalizedGlobalRubric ? `Teacher ${language} global rubric (enabled):\n${normalizedGlobalRubric}` : ""].filter(Boolean).join("\n\n"),
        llmConfig: getActiveLlmConfig()
      });
      const parsed = normalizeAndValidateResult(rawResponse);
      setResult(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error while grading assignment.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  /* ── Batch session ── */
  function handleStartBatchSession() {
    if (!batchSessionName.trim()) { setBatchError("Please provide a batch session name."); return; }
    if (!questions.trim() || !rubric.trim()) { setBatchError("Please provide assignment questions and rubric before starting a batch."); return; }
    const selectedClass = classes.find((cls) => cls.classId === selectedClassId);
    if (!selectedClass) { setBatchError("Please select a class before starting batch session."); return; }
    if (activeBatchSession) {
      const shouldReplace = window.confirm("A batch session is already active. Start a new batch and replace the current one?");
      if (!shouldReplace) return;
    }
    const nextSession = createBatchSession({
      batchSessionName,
      classId: selectedClass.classId,
      className: selectedClass.className,
      provider: getActiveLlmConfig().provider,
      model: getActiveLlmConfig().model,
      baseUrl: getActiveLlmConfig().baseUrl,
      language, strictness,
      globalRubricEnabled: useGlobalRubric,
      globalRubricByLanguage: globalRubric,
      rubric: rubric.trim(),
      sampleAnswer: sampleAnswer.trim(),
      assignmentQuestions: questions.trim()
    });
    updateActiveBatchSession(nextSession);
    setBatchCurrentResult(null);
    setBatchError("");
    setBatchStudentCode("");
    setSelectedStudentId(selectedClass.students[0]?.id || "");
  }

  function handleDeleteBatchSession() {
    if (!activeBatchSession) return;
    const shouldDelete = window.confirm(`Delete batch session "${activeBatchSession.batchSessionName}" and all saved students?`);
    if (!shouldDelete) return;
    clearCurrentBatchSession();
    setActiveBatchSession(null);
    setBatchCurrentResult(null);
    setBatchError("");
    setBatchStudentCode("");
    setSelectedStudentId("");
  }

  /* ── Class helpers ── */
  function getSelectedClass() {
    return classes.find((cls) => cls.classId === selectedClassId) || null;
  }

  function getActiveClassRoster() {
    if (!activeBatchSession?.classId) return [];
    const cls = classes.find((c) => c.classId === activeBatchSession.classId);
    return cls?.students || [];
  }

  function handleCreateClass() {
    if (!newClassName.trim()) return;
    const newClass = { classId: `class-${Date.now()}`, className: newClassName.trim(), students: [] };
    const next = [...classes, newClass];
    setClasses(next);
    saveClasses(next);
    setSelectedClassId(newClass.classId);
    saveSelectedClassId(newClass.classId);
    setNewClassName("");
  }

  function handleDeleteSelectedClass() {
    if (!selectedClassId) return;
    const selected = classes.find((c) => c.classId === selectedClassId);
    const shouldDelete = window.confirm(`Delete class "${selected?.className || "selected"}"?`);
    if (!shouldDelete) return;
    const next = classes.filter((c) => c.classId !== selectedClassId);
    setClasses(next);
    saveClasses(next);
    setSelectedClassId("");
    saveSelectedClassId("");
  }

  function handleImportRoster() {
    const cls = getSelectedClass();
    if (!cls) { setBatchError("Select a class before importing roster."); return; }
    const imported = parseRosterPaste(rosterPasteText);
    const nextClasses = classes.map((c) => c.classId === cls.classId ? { ...c, students: imported } : c);
    setClasses(nextClasses);
    saveClasses(nextClasses);
    setRosterPasteText("");
    setSelectedStudentId(imported[0]?.id || "");
  }

  /* ── Student helpers ── */
  function latestQueueItemForStudent(session, studentId) {
    const matched = (session.queueItems || []).filter((q) => q.id === studentId);
    if (!matched.length) return null;
    return matched.reduce((latest, item) => !latest || item.updatedAt > latest.updatedAt ? item : latest, null);
  }

  function statusForStudent(session, student) {
    const latestQueue = latestQueueItemForStudent(session, student.id);
    if (latestQueue?.status === "grading") return "Grading";
    if (latestQueue?.status === "queued") return "Queued";
    if (latestQueue?.status === "error") return "Error";
    const saved = (session.students || []).find((s) => s.id === student.id);
    if (saved) return "Done";
    return "Not started";
  }

  function selectNextNotStartedStudent() {
    if (!activeBatchSession) return;
    const roster = getActiveClassRoster();
    const currentIndex = roster.findIndex((s) => s.id === selectedStudentId);
    for (let i = currentIndex + 1; i < roster.length; i += 1) {
      const st = statusForStudent(activeBatchSession, roster[i]);
      if (st === "Not started") { setSelectedStudentId(roster[i].id); return; }
    }
  }

  /* ── Queue helpers ── */
  function handleAddQueueItem() {
    setBatchError("");
    if (!activeBatchSession) { setBatchError("Please start a batch session first."); return; }
    const roster = getActiveClassRoster();
    const selectedStudent = roster.find((s) => s.id === selectedStudentId);
    if (!selectedStudent) { setBatchError("Please select a student from roster."); return; }
    if (!batchStudentCode.trim()) { setBatchError("Please paste student code."); return; }
    const snapshot = {
      language: activeBatchSession.language,
      strictness: activeBatchSession.strictness,
      globalRubricEnabled: activeBatchSession.globalRubricEnabled,
      globalRubricByLanguage: activeBatchSession.globalRubricByLanguage,
      rubric: activeBatchSession.rubric,
      sampleAnswer: activeBatchSession.sampleAnswer,
      assignmentQuestions: activeBatchSession.assignmentQuestions,
      provider: getActiveLlmConfig().provider,
      model: getActiveLlmConfig().model,
      baseUrl: getActiveLlmConfig().baseUrl
    };
    const queueItem = {
      queueId: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "queued",
      id: selectedStudent.id,
      studentName: selectedStudent.name,
      studentCode: batchStudentCode,
      snapshot,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      errorMessage: ""
    };
    const nextSession = { ...activeBatchSession, queueItems: [...(activeBatchSession.queueItems || []), queueItem] };
    updateActiveBatchSession(nextSession);
    setBatchStudentCode("");
    selectNextNotStartedStudent();
  }

  function handleClearCurrentStudent() { setBatchStudentCode(""); setBatchError(""); }

  function handleClearBatchStudents() {
    if (!activeBatchSession) return;
    const shouldClear = window.confirm("Clear all graded students in this batch?");
    if (!shouldClear) return;
    const nextSession = clearStudentsInBatchSession(activeBatchSession);
    updateActiveBatchSession(nextSession);
    setBatchCurrentResult(null);
  }

  function handleStartNewBatch() {
    const shouldReset = window.confirm("Start a new batch session? Current active batch will be cleared.");
    if (!shouldReset) return;
    clearCurrentBatchSession();
    setActiveBatchSession(null);
    setBatchCurrentResult(null);
    setBatchError("");
    setBatchStudentCode("");
    setBatchSessionName("");
    setSelectedStudentId("");
  }

  function updateQueueItem(queueId, patch) {
    if (!activeBatchSession) return null;
    const nextSession = {
      ...activeBatchSession,
      queueItems: (activeBatchSession.queueItems || []).map((item) =>
        item.queueId === queueId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
      )
    };
    updateActiveBatchSession(nextSession);
    return nextSession;
  }

  async function processOneQueueItem(item) {
    if (!activeBatchSession) return;
    processingRef.current = true;
    setBatchLoading(true);
    updateQueueItem(item.queueId, { status: "grading", errorMessage: "" });
    try {
      const rules = buildGlobalRulesText(item.snapshot);
      const response = await gradeAssignmentWithMeta({
        language: item.snapshot.language,
        strictness: item.snapshot.strictness,
        questions: item.snapshot.assignmentQuestions,
        rubric: item.snapshot.rubric,
        sampleAnswer: item.snapshot.sampleAnswer,
        code: item.studentCode,
        noPenaltyRules: rules,
        llmConfig: getLlmConfigForProvider(item.snapshot.provider, item.snapshot.model, item.snapshot.baseUrl)
      });
      const parsed = normalizeAndValidateResult(response.rawText);
      const usage = usageWithCost(response.usage, item.snapshot.provider, item.snapshot.model);
      const studentEntry = {
        id: item.id,
        studentName: item.studentName,
        studentCode: item.studentCode,
        status: "Done",
        result: parsed,
        shortComment: deriveShortComment(parsed),
        earnedScore: parsed.total_score,
        possibleScore: parsed.total_max_score,
        timestamp: new Date().toISOString(),
        usage,
        provider: item.snapshot.provider,
        model: item.snapshot.model
      };
      const afterQueueSession = updateQueueItem(item.queueId, { status: "done", usage });
      const latestSession = afterQueueSession || activeBatchSession;
      const nextSession = upsertStudentInBatchSession(latestSession, studentEntry);
      updateActiveBatchSession(nextSession);
      setBatchCurrentResult(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Queue grading failed.";
      updateQueueItem(item.queueId, { status: "error", errorMessage: message });
      const studentEntry = {
        id: item.id,
        studentName: item.studentName,
        studentCode: item.studentCode,
        status: "Error",
        result: null,
        shortComment: message,
        earnedScore: "",
        possibleScore: "",
        timestamp: new Date().toISOString(),
        usage: null
      };
      const nextSession = upsertStudentInBatchSession(activeBatchSession, studentEntry);
      updateActiveBatchSession(nextSession);
      setBatchError(message);
    } finally {
      processingRef.current = false;
      setBatchLoading(false);
    }
  }

  const autoQueueEnabled = Boolean(activeBatchSession?.autoStartQueue) && !Boolean(activeBatchSession?.queuePaused);
  useEffect(() => {
    if (mode !== "batch") return;
    if (!activeBatchSession) return;
    if (!autoQueueEnabled) return;
    if (processingRef.current) return;
    const nextItem = (activeBatchSession.queueItems || []).find((q) => q.status === "queued");
    if (!nextItem) return;
    processOneQueueItem(nextItem);
  }, [mode, activeBatchSession, autoQueueEnabled]);

  function handlePauseQueue() { if (!activeBatchSession) return; updateActiveBatchSession({ ...activeBatchSession, queuePaused: true }); }
  function handleResumeQueue() { if (!activeBatchSession) return; updateActiveBatchSession({ ...activeBatchSession, queuePaused: false }); }
  function handleStartQueue() { if (!activeBatchSession) return; updateActiveBatchSession({ ...activeBatchSession, queuePaused: false, autoStartQueue: true }); }

  function handleRetryErrorItems() {
    if (!activeBatchSession) return;
    const nextItems = (activeBatchSession.queueItems || []).map((q) => q.status === "error" ? { ...q, status: "queued", errorMessage: "" } : q);
    updateActiveBatchSession({ ...activeBatchSession, queueItems: nextItems });
  }

  function handleClearCompletedQueue() {
    if (!activeBatchSession) return;
    const nextItems = (activeBatchSession.queueItems || []).filter((q) => q.status !== "done");
    updateActiveBatchSession({ ...activeBatchSession, queueItems: nextItems });
  }

  function handleClearQueue() {
    if (!activeBatchSession) return;
    updateActiveBatchSession({ ...activeBatchSession, queueItems: [] });
  }

  function handleRequeueStudent(studentName) {
    if (!activeBatchSession) return;
    const student = activeBatchSession.students.find((s) => s.studentName === studentName);
    if (!student) return;
    const queueItem = {
      queueId: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "queued",
      id: student.id,
      studentName: student.studentName,
      studentCode: student.studentCode,
      snapshot: {
        language: activeBatchSession.language,
        strictness: activeBatchSession.strictness,
        globalRubricEnabled: activeBatchSession.globalRubricEnabled,
        globalRubricByLanguage: activeBatchSession.globalRubricByLanguage,
        rubric: activeBatchSession.rubric,
        sampleAnswer: activeBatchSession.sampleAnswer,
        assignmentQuestions: activeBatchSession.assignmentQuestions,
        provider: getActiveLlmConfig().provider,
        model: getActiveLlmConfig().model,
        baseUrl: getActiveLlmConfig().baseUrl
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      errorMessage: ""
    };
    updateActiveBatchSession({ ...activeBatchSession, queueItems: [...(activeBatchSession.queueItems || []), queueItem] });
  }

  function handleDeleteResult(studentName) {
    if (!activeBatchSession) return;
    const nextSession = removeStudentFromBatchSession(activeBatchSession, studentName);
    updateActiveBatchSession(nextSession);
  }

  /* ── Derived roster ── */
  const rosterWithStatus = useMemo(() => {
    const roster = activeBatchSession ? getActiveClassRoster() : (getSelectedClass()?.students || []);
    if (!activeBatchSession) {
      return roster.map((student) => ({ ...student, status: "Not started", score: "" }));
    }
    return roster.map((student) => {
      const status = statusForStudent(activeBatchSession, student);
      const saved = (activeBatchSession.students || []).find((s) => s.id === student.id);
      return { ...student, status, score: saved && saved.earnedScore !== "" ? `${saved.earnedScore}/${saved.possibleScore}` : "" };
    });
  }, [classes, selectedClassId, activeBatchSession]);

  const selectedRosterStudent = rosterWithStatus.find((s) => s.id === selectedStudentId) || null;

  /* ── Saved result for the currently selected roster student ── */
  const selectedStudentSavedEntry = useMemo(() => {
    if (!activeBatchSession || !selectedStudentId) return null;
    return (activeBatchSession.students || []).find((s) => s.id === selectedStudentId) || null;
  }, [activeBatchSession, selectedStudentId]);

  const costSummary = useMemo(() => {
    const students = activeBatchSession?.students || [];
    let inputTokens = 0, outputTokens = 0, totalTokens = 0, totalCost = 0;
    let usageAvailable = false, costAvailable = false;
    students.forEach((s) => {
      if (typeof s.usage?.inputTokens === "number") { usageAvailable = true; inputTokens += s.usage.inputTokens; }
      if (typeof s.usage?.outputTokens === "number") { usageAvailable = true; outputTokens += s.usage.outputTokens; }
      if (typeof s.usage?.totalTokens === "number") { usageAvailable = true; totalTokens += s.usage.totalTokens; }
      if (typeof s.usage?.estimatedCost === "number") { costAvailable = true; totalCost += s.usage.estimatedCost; }
    });
    return { inputTokens, outputTokens, totalTokens, totalCost, usageAvailable, costAvailable };
  }, [activeBatchSession]);

  /* ── Queue stats ── */
  const queueItems = activeBatchSession?.queueItems || [];
  const queueDone    = queueItems.filter((q) => q.status === "done").length;
  const queueQueued  = queueItems.filter((q) => q.status === "queued").length;
  const queueError   = queueItems.filter((q) => q.status === "error").length;
  const queueGrading = queueItems.filter((q) => q.status === "grading").length;

  /* ── Provider panel renderer ── */
  function renderProviderPanel(disabled = false) {
    const activeProvider = providerConfig.activeProvider || "openai";
    const active = providerConfig[activeProvider] || DEFAULT_PROVIDER_CONFIG[activeProvider];
    const models = PROVIDER_MODEL_OPTIONS[activeProvider] || [];
    const keyLabel = activeProvider === "kimi_cn" ? "Kimi API Key" : "OpenAI API Key";
    return (
      <div className="provider-panel">
        <div className="provider-panel-header">
          <label style={{ margin: 0 }}>Provider</label>
          <button type="button" className="btn-secondary" disabled={disabled || providerTesting} onClick={handleTestProviderConnection}>
            {providerTesting ? "Testing..." : "Test"}
          </button>
        </div>
        <div className="provider-switch-row">
          <button type="button" className={`btn-secondary ${activeProvider === "openai" ? "provider-active" : ""}`} disabled={disabled} onClick={() => handleActiveProviderChange("openai")}>
            OpenAI
          </button>
          <button type="button" className={`btn-secondary ${activeProvider === "kimi_cn" ? "provider-active" : ""}`} disabled={disabled} onClick={() => handleActiveProviderChange("kimi_cn")}>
            Kimi (CN)
          </button>
        </div>
        {activeProvider === "kimi_cn" && (
          <p className="hint-text">Uses OpenAI-compatible endpoint. Requires Kimi Open Platform API key.</p>
        )}
        <div className="field">
          <label htmlFor={`providerModel-${activeProvider}`}>Model</label>
          <select id={`providerModel-${activeProvider}`} value={active.model} onChange={(e) => handleProviderFieldChange(activeProvider, "model", e.target.value)} disabled={disabled}>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`providerApiKey-${activeProvider}`}>{keyLabel}</label>
          <input id={`providerApiKey-${activeProvider}`} type="password" value={active.apiKey} onChange={(e) => handleProviderFieldChange(activeProvider, "apiKey", e.target.value)} placeholder={activeProvider === "kimi_cn" ? "kimi-..." : "sk-..."} disabled={disabled} />
        </div>
        <div className="field">
          <label htmlFor={`providerBaseUrl-${activeProvider}`}>Base URL</label>
          <input id={`providerBaseUrl-${activeProvider}`} type="text" value={active.baseUrl} onChange={(e) => handleProviderFieldChange(activeProvider, "baseUrl", e.target.value)} disabled={disabled} />
        </div>
        {providerTestStatus && (
          <p className="hint-text" style={{ color: providerTestStatus.startsWith("Connected:") ? "var(--green)" : "var(--red)" }}>
            {providerTestStatus}
          </p>
        )}
      </div>
    );
  }

  /* ── Assignment Setup panel content (shared between single & batch) ── */
  function renderAssignmentSetupPanel() {
    return (
      <>
        <SectionCard title="Rubric" defaultOpen={true}>
          <RubricInput value={rubric} onChange={setRubric} disabled={batchLocked} />
          <button type="button" className="btn-secondary btn-full" onClick={() => setShowRubricSplitter(true)} disabled={batchLocked}>
            Rubric Splitter
          </button>
        </SectionCard>

        <SectionCard title="Sample Answer" defaultOpen={true}>
          <SampleAnswerInput value={sampleAnswer} onChange={setSampleAnswer} disabled={batchLocked} />
        </SectionCard>

        <SectionCard title="Assignment Questions" defaultOpen={true}>
          <QuestionInput value={questions} onChange={setQuestions} disabled={batchLocked} />
        </SectionCard>
      </>
    );
  }

  /* ── Topbar derived ── */
  const activeLlm = getActiveLlmConfig();
  const providerLabel = activeLlm.provider === "kimi_cn" ? "Kimi CN" : "OpenAI";
  const batchLocked = mode === "batch" && Boolean(activeBatchSession);

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <div className="app-shell">

      {/* ── Topbar ── */}
      <header className="app-topbar">

        {/* LEFT: App identity */}
        <div className="topbar-left">
          <img src="app-icon.png" alt="App Icon" className="topbar-app-icon" />
          <div className="topbar-app-identity">
            <span className="topbar-app-name">Code Assignment Grader</span>
          </div>
        </div>

        {/* CENTER: Navigation */}
        <div className="topbar-center">
          <BatchModeSwitch mode={mode} onChange={handleModeChange} />
        </div>

        {/* RIGHT: Status + author */}
        <div className="topbar-right">
          <div className="topbar-provider-badge">
            <span className="topbar-provider-dot" />
            <span>{providerLabel} · {activeLlm.model}</span>
          </div>
          <div className="topbar-divider-v" />
          <div className="topbar-author">
            <img src="school-logo.png" alt="Haidian KaiWen Academy" className="topbar-author-logo" />
            <span className="topbar-author-text">Developed by Yuyin Liu</span>
          </div>
        </div>

      </header>

      {/* ── Workspace ── */}
      <div className="app-workspace">

        {/* ══════════════════════════════════════════════════
            PANEL 1 — SETUP
            Language, AI provider, global rules
            Batch mode also: class, roster import, session
            ══════════════════════════════════════════════════ */}
        <aside className="panel panel-setup">
          <div className="panel-header">
            <span className="panel-header-title">Setup</span>
          </div>
          <div className="panel-inner">

            <SectionCard title="Language & Strictness" defaultOpen={true}>
              <LanguageSelector value={language} onChange={setLanguage} disabled={batchLocked} />
              <StrictnessSelector value={strictness} onChange={setStrictness} disabled={batchLocked} />
            </SectionCard>

            <SectionCard title="AI Provider" defaultOpen={true}>
              {renderProviderPanel(batchLocked)}
            </SectionCard>

            <SectionCard title="Global Rules" defaultOpen={false}>
              <div className="flex-row">
                <span className={`status-chip ${useGlobalRubric ? "on" : "off"}`}>
                  {useGlobalRubric ? "ENABLED" : "DISABLED"}
                </span>
                <button type="button" className={`toggle-button ${useGlobalRubric ? "active" : ""}`} onClick={handleUseGlobalRubricToggle} disabled={batchLocked}>
                  {useGlobalRubric ? "Disable" : "Enable"}
                </button>
              </div>
              <div className="field">
                <label htmlFor="globalRubricSetup">Rules for {language}</label>
                <textarea id="globalRubricSetup" value={globalRubric[languageKey(language)] || ""} onChange={(e) => handleGlobalRubricChange(e.target.value)} placeholder={`Add ${language} grading policies...`} rows={6} disabled={batchLocked} />
              </div>
              <button type="button" className="btn-secondary btn-full" onClick={() => setShowGlobalRubricAssistant(true)} disabled={batchLocked}>
                AI Assistant
              </button>
            </SectionCard>

            {mode === "batch" && (
              <>
                <SectionCard title="Class & Roster" defaultOpen={true}>
                  <div className="field">
                    <label htmlFor="classSelect">Class</label>
                    <select id="classSelect" value={selectedClassId} onChange={(e) => { setSelectedClassId(e.target.value); saveSelectedClassId(e.target.value); }} disabled={batchLocked}>
                      <option value="">Select class...</option>
                      {classes.map((cls) => <option key={cls.classId} value={cls.classId}>{cls.className}</option>)}
                    </select>
                  </div>
                  <div className="flex-row">
                    <input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="New class name" disabled={batchLocked} style={{ flex: 1 }} />
                    <button type="button" className="btn-secondary" onClick={handleCreateClass} disabled={batchLocked}>Create</button>
                    <button type="button" className="btn-secondary btn-danger" onClick={handleDeleteSelectedClass} disabled={batchLocked}>Del</button>
                  </div>
                  <div className="field">
                    <label htmlFor="rosterPaste">Roster import</label>
                    <textarea id="rosterPaste" value={rosterPasteText} onChange={(e) => setRosterPasteText(e.target.value)} rows={4} placeholder={"Alice\nBob\nCindy\n\nor Alice,001"} disabled={batchLocked} />
                    <button type="button" className="btn-secondary" onClick={handleImportRoster} disabled={batchLocked}>Import Roster</button>
                  </div>
                </SectionCard>

                <SectionCard title="Batch Session" defaultOpen={true}>
                  <div className="field">
                    <label htmlFor="batchSessionName">Session name</label>
                    <input id="batchSessionName" type="text" value={batchSessionName} onChange={(e) => setBatchSessionName(e.target.value)} placeholder="Q1 Receipt Batch" disabled={batchLocked} />
                  </div>
                  <button type="button" className="btn-primary btn-full" onClick={handleStartBatchSession}>
                    {activeBatchSession ? "Start New Session" : "Start Batch Session"}
                  </button>
                  {activeBatchSession && (
                    <button type="button" className="btn-secondary btn-danger btn-full" onClick={handleDeleteBatchSession}>
                      Delete Session
                    </button>
                  )}
                  {batchError && <p className="error-message">{batchError}</p>}
                </SectionCard>
              </>
            )}

          </div>
        </aside>

        {/* ══════════════════════════════════════════════════
            PANEL 2 — ASSIGNMENT SETUP
            Rubric, sample answer, assignment questions
            Always visible in both modes
            ══════════════════════════════════════════════════ */}
        <aside className="panel panel-assignment">
          <div className="panel-header">
            <span className="panel-header-title">Assignment Setup</span>
          </div>
          <div className="panel-inner">
            {renderAssignmentSetupPanel()}
          </div>
        </aside>

        {/* ══════════════════════════════════════════════════
            PANEL 3 — ROSTER SLOT
            Batch mode: student roster with statuses
            Single mode: not shown (layout is 4 panels)
            ══════════════════════════════════════════════════ */}
        {mode === "batch" && (
          <aside className="panel panel-roster">
            <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="panel-header-title">Roster</span>
              {rosterWithStatus.length > 0 && (
                <span className="hint-text">{rosterWithStatus.length} students</span>
              )}
            </div>
            <div className="panel-inner">

              {rosterWithStatus.length > 0 && (
                <div className="roster-stats">
                  <div className="roster-stat">
                    <span className="roster-stat-value" style={{ color: "var(--green)" }}>
                      {rosterWithStatus.filter((s) => s.status === "Done").length}
                    </span>
                    <span className="roster-stat-label">Done</span>
                  </div>
                  <div className="roster-stat">
                    <span className="roster-stat-value" style={{ color: "var(--amber)" }}>
                      {rosterWithStatus.filter((s) => s.status === "Queued").length}
                    </span>
                    <span className="roster-stat-label">Queued</span>
                  </div>
                  <div className="roster-stat">
                    <span className="roster-stat-value" style={{ color: "var(--blue)" }}>
                      {rosterWithStatus.filter((s) => s.status === "Grading").length}
                    </span>
                    <span className="roster-stat-label">Grading</span>
                  </div>
                  <div className="roster-stat">
                    <span className="roster-stat-value" style={{ color: "var(--red)" }}>
                      {rosterWithStatus.filter((s) => s.status === "Error").length}
                    </span>
                    <span className="roster-stat-label">Error</span>
                  </div>
                </div>
              )}

              {rosterWithStatus.length === 0 ? (
                <div style={{ padding: "24px 8px", textAlign: "center" }}>
                  <p className="hint-text">No roster loaded.<br />Import a class roster in the Setup panel.</p>
                </div>
              ) : (
                <div className="roster-list">
                  {rosterWithStatus.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      className={`roster-item ${selectedStudentId === student.id ? "selected" : ""}`}
                      onClick={() => setSelectedStudentId(student.id)}
                    >
                      <span className="roster-item-name">{student.name}</span>
                      <div className="roster-item-right">
                        {student.score && <span className="roster-item-score">{student.score}</span>}
                        <span className={statusChipClass(student.status)}>{student.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

            </div>
          </aside>
        )}

        {/* ══════════════════════════════════════════════════
            PANEL 4 — WORK
            Primary interaction area
            ══════════════════════════════════════════════════ */}
        <main className="panel panel-work">
          <div className="panel-header">
            <span className="panel-header-title">
              {mode === "single" ? "Student Submission" : "Work"}
            </span>
          </div>
          <div className="panel-inner">

            {mode === "single" ? (
              <WbCard title="Student Code">
                <CodeInput value={code} onChange={setCode} rows={20} />
                <div className="action-row" style={{ marginTop: "4px" }}>
                  <GradeButton onClick={handleGrade} disabled={!canGrade} loading={loading} />
                  <button type="button" className="btn-secondary" onClick={() => { setCode(""); setResult(null); setError(""); }}>
                    Clear
                  </button>
                </div>
                {error && <p className="error-message">{error}</p>}
              </WbCard>
            ) : (
              <>
                <WbCard title="Current Student">
                  <div className="current-student-bar">
                    {selectedRosterStudent ? (
                      <>
                        <span className="current-student-name">{selectedRosterStudent.name}</span>
                        <span className={statusChipClass(selectedRosterStudent.status)}>{selectedRosterStudent.status}</span>
                      </>
                    ) : (
                      <span className="current-student-empty">No student selected — click a name in the Roster panel</span>
                    )}
                  </div>
                  <CodeInput value={batchStudentCode} onChange={setBatchStudentCode} rows={16} />
                  <div className="action-row" style={{ marginTop: "4px" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ flex: 1 }}
                      onClick={handleAddQueueItem}
                      disabled={!activeBatchSession || !selectedRosterStudent || !batchStudentCode.trim()}
                    >
                      Add to Queue
                    </button>
                    <button type="button" className="btn-secondary" onClick={handleClearCurrentStudent}>
                      Clear
                    </button>
                    <button type="button" className="btn-secondary" onClick={selectNextNotStartedStudent} disabled={!activeBatchSession}>
                      Next →
                    </button>
                  </div>
                  {batchError && <p className="error-message">{batchError}</p>}
                </WbCard>

                <WbCard title="Queue Controls">
                  <div className="queue-stats-bar">
                    <div className="queue-stat">
                      <span className="queue-stat-value" style={{ color: "var(--green)" }}>{queueDone}</span>
                      <span className="queue-stat-label">Done</span>
                    </div>
                    <div className="queue-stat">
                      <span className="queue-stat-value" style={{ color: "var(--amber)" }}>{queueQueued}</span>
                      <span className="queue-stat-label">Queued</span>
                    </div>
                    <div className="queue-stat">
                      <span className="queue-stat-value" style={{ color: "var(--blue)" }}>{queueGrading}</span>
                      <span className="queue-stat-label">Grading</span>
                    </div>
                    <div className="queue-stat">
                      <span className="queue-stat-value" style={{ color: "var(--red)" }}>{queueError}</span>
                      <span className="queue-stat-label">Error</span>
                    </div>
                  </div>
                  <div className="action-row">
                    <button type="button" className="btn-primary" onClick={handleStartQueue} disabled={!activeBatchSession || queueQueued === 0}>
                      ▶ Start
                    </button>
                    <button type="button" className="btn-secondary" onClick={handlePauseQueue} disabled={!activeBatchSession}>
                      ⏸ Pause
                    </button>
                    <button type="button" className="btn-secondary" onClick={handleResumeQueue} disabled={!activeBatchSession}>
                      ▶ Resume
                    </button>
                    <button type="button" className="btn-secondary" onClick={handleRetryErrorItems} disabled={!activeBatchSession || queueError === 0}>
                      ↺ Retry
                    </button>
                    <button type="button" className="btn-secondary btn-danger" onClick={handleClearQueue} disabled={!activeBatchSession}>
                      Clear
                    </button>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px", color: "var(--text-secondary)" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(activeBatchSession?.autoStartQueue)}
                      onChange={(e) => activeBatchSession && updateActiveBatchSession({ ...activeBatchSession, autoStartQueue: e.target.checked })}
                    />
                    Auto-start queue when items are added
                  </label>
                </WbCard>
              </>
            )}

          </div>
        </main>

        {/* ══════════════════════════════════════════════════
            PANEL 5 — RESULT
            Output, monitoring, and feedback
            ══════════════════════════════════════════════════ */}
        <aside className="panel panel-result">
          <div className="panel-header">
            <span className="panel-header-title">Result</span>
          </div>
          <div className="panel-inner">

            {mode === "single" ? (
              <ResultPanel loading={loading} result={result} error={error} />
            ) : (
              <>
                <ResultPanel
                  loading={batchLoading}
                  result={selectedStudentSavedEntry ? selectedStudentSavedEntry.result : batchCurrentResult}
                  error={batchError}
                  studentName={selectedRosterStudent?.name || null}
                  studentCode={selectedStudentSavedEntry?.studentCode || null}
                  studentStatus={selectedRosterStudent?.status || null}
                />
                <BatchProgressPanel
                  session={activeBatchSession}
                  onDeleteResult={handleDeleteResult}
                  onRequeueStudent={handleRequeueStudent}
                  onExportSimpleCsv={() => activeBatchSession && exportSimpleCsv(activeBatchSession, getActiveClassRoster())}
                  onExportDetailedCsv={() => activeBatchSession && exportDetailedCsv(activeBatchSession, getActiveClassRoster())}
                  onExportTeachingReport={() => activeBatchSession && exportTeachingReport(activeBatchSession, getActiveClassRoster(), getActiveLlmConfig())}
                  onClearBatch={handleClearBatchStudents}
                  onStartNewBatch={handleStartNewBatch}
                  onStartQueue={handleStartQueue}
                  onPauseQueue={handlePauseQueue}
                  onResumeQueue={handleResumeQueue}
                  onRetryErrorItems={handleRetryErrorItems}
                  onClearCompleted={handleClearCompletedQueue}
                  costSummary={costSummary}
                />
              </>
            )}

          </div>
        </aside>

      </div>

      {/* ── Modals ── */}
      <RubricSplitterModal
        isOpen={showRubricSplitter}
        onClose={() => setShowRubricSplitter(false)}
        seedText={[rubric, sampleAnswer].filter(Boolean).join("\n\n")}
        onUseInGrader={handleUseSplitContent}
        llmConfig={getActiveLlmConfig()}
        modelOptions={PROVIDER_MODEL_OPTIONS[getActiveLlmConfig().provider] || []}
      />
      <GlobalRubricAssistantModal
        isOpen={showGlobalRubricAssistant}
        onClose={() => setShowGlobalRubricAssistant(false)}
        language={language}
        currentGlobalRubric={globalRubric[languageKey(language)] || ""}
        onApplyGlobalRubric={handleGlobalRubricChange}
        llmConfig={getActiveLlmConfig()}
      />
    </div>
  );
}

export default App;
