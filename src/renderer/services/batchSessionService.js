const BATCH_SESSION_STORAGE_KEY = "grader_batch_session_current";

function safeNowIso() {
  return new Date().toISOString();
}

export function createBatchSession({
  batchSessionName,
  classId,
  className,
  provider,
  model,
  baseUrl,
  language,
  strictness,
  globalRubricEnabled,
  globalRubricByLanguage,
  rubric,
  sampleAnswer,
  assignmentQuestions
}) {
  return {
    batchId: `batch-${Date.now()}`,
    batchSessionName: batchSessionName.trim(),
    timestamp: safeNowIso(),
    classId: classId || "",
    className: className || "",
    provider: provider || "openai",
    model: model || "",
    baseUrl: baseUrl || "",
    language,
    strictness,
    globalRubricEnabled,
    globalRubricByLanguage: {
      python: globalRubricByLanguage?.python || "",
      java: globalRubricByLanguage?.java || ""
    },
    rubric,
    sampleAnswer,
    assignmentQuestions,
    students: [],
    queueItems: [],
    queuePaused: false,
    autoStartQueue: true
  };
}

export function loadCurrentBatchSession() {
  const raw = window.localStorage.getItem(BATCH_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.students)) {
      parsed.students = [];
    }
    if (!Array.isArray(parsed.queueItems)) {
      parsed.queueItems = [];
    }
    if (typeof parsed.queuePaused !== "boolean") {
      parsed.queuePaused = false;
    }
    if (typeof parsed.autoStartQueue !== "boolean") {
      parsed.autoStartQueue = true;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCurrentBatchSession(session) {
  window.localStorage.setItem(BATCH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearCurrentBatchSession() {
  window.localStorage.removeItem(BATCH_SESSION_STORAGE_KEY);
}

export function upsertStudentInBatchSession(session, studentEntry) {
  const normalizedName = (studentEntry.studentName || "").trim().toLowerCase();
  const existingIndex = session.students.findIndex(
    (s) => (s.studentName || "").trim().toLowerCase() === normalizedName
  );
  const nextStudents = [...session.students];
  if (existingIndex > -1) {
    nextStudents[existingIndex] = studentEntry;
  } else {
    nextStudents.push(studentEntry);
  }
  return {
    ...session,
    students: nextStudents
  };
}

export function removeStudentFromBatchSession(session, studentName) {
  const normalizedName = (studentName || "").trim().toLowerCase();
  return {
    ...session,
    students: session.students.filter(
      (s) => (s.studentName || "").trim().toLowerCase() !== normalizedName
    )
  };
}

export function clearStudentsInBatchSession(session) {
  return {
    ...session,
    students: [],
    queueItems: []
  };
}

export function averageScore(session) {
  if (!session?.students?.length) return 0;
  const ratios = session.students
    .map((s) => {
      const earned = Number(s.earnedScore);
      const possible = Number(s.possibleScore);
      if (!Number.isFinite(earned) || !Number.isFinite(possible) || possible <= 0) return null;
      return earned / possible;
    })
    .filter((v) => v !== null);
  if (!ratios.length) return 0;
  return ratios.reduce((acc, v) => acc + v, 0) / ratios.length;
}

export function queueCounts(session) {
  const items = session?.queueItems || [];
  return {
    queued: items.filter((q) => q.status === "queued").length,
    grading: items.filter((q) => q.status === "grading").length,
    done: items.filter((q) => q.status === "done").length,
    error: items.filter((q) => q.status === "error").length
  };
}

