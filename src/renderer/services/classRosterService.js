const CLASSES_STORAGE_KEY = "grader_classes";
const SELECTED_CLASS_ID_KEY = "grader_selected_class_id";

export function loadClasses() {
  const raw = window.localStorage.getItem(CLASSES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        classId: item.classId || `class-${Date.now()}`,
        className: item.className || "Untitled Class",
        students: Array.isArray(item.students)
          ? item.students.map((s) => ({
              id: s?.id
                ? String(s.id)
                : s?.studentId
                  ? String(s.studentId)
                  : `student-${Math.random().toString(36).slice(2, 10)}`,
              name: s?.name
                ? String(s.name)
                : s?.studentName
                  ? String(s.studentName)
                  : "",
              status: typeof s?.status === "string" ? s.status : "Not started"
            }))
          : []
      }));
  } catch {
    return [];
  }
}

export function saveClasses(classes) {
  window.localStorage.setItem(CLASSES_STORAGE_KEY, JSON.stringify(classes));
}

export function loadSelectedClassId() {
  return window.localStorage.getItem(SELECTED_CLASS_ID_KEY) || "";
}

export function saveSelectedClassId(classId) {
  window.localStorage.setItem(SELECTED_CLASS_ID_KEY, classId || "");
}

export function parseRosterPaste(text) {
  const lines = (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const students = [];
  lines.forEach((line) => {
    const normalizedLine = line.replace(/，/g, ",");
    const fullText = normalizedLine.replace(/\s+/g, " ").trim();
    if (!fullText) return;

    const commaParts = fullText
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    let normalizedName = fullText;
    if (commaParts.length >= 2) {
      const first = commaParts[0];
      const rest = commaParts.slice(1).join(" ").trim();
      const hasEnglishAliasInParen = /\([A-Za-z][^)]*\)/.test(rest);
      const restLooksLikeId =
        /^(?:id[:\s-]*)?\d[\da-z_-]*$/i.test(rest) ||
        /^(?:id[:\s-]*)?[a-z]+\d[\da-z_-]*$/i.test(rest);
      if (hasEnglishAliasInParen) {
        normalizedName = `${first}, ${rest}`;
      } else {
        normalizedName = restLooksLikeId ? first : `${first} ${rest}`;
      }
    }

    normalizedName = normalizedName.replace(/\s+/g, " ").trim();
    if (!normalizedName) return;
    students.push({
      id: `student-${Math.random().toString(36).slice(2, 10)}`,
      name: normalizedName,
      status: "Not started"
    });
  });
  const seen = new Set();
  return students.filter((s) => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

